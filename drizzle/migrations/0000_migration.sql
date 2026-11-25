
CREATE TABLE public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  title text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('daily','weekly')),
  target int NOT NULL DEFAULT 1 CHECK (target BETWEEN 1 AND 7),
  points int NOT NULL DEFAULT 10 CHECK (points BETWEEN 0 AND 1000),
  paused boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.goals TO authenticated;
GRANT ALL ON public.goals TO service_role;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own goals select" ON public.goals FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own goals insert" ON public.goals FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own goals update" ON public.goals FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.completion_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  goal_id uuid NOT NULL REFERENCES public.goals(id),
  completed_on date NOT NULL,
  points int NOT NULL,
  undone_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX completion_daily_once ON public.completion_records(goal_id, completed_on) WHERE undone_at IS NULL AND points >= 0 AND false;
CREATE INDEX ON public.completion_records(user_id, completed_on);
GRANT SELECT ON public.completion_records TO authenticated;
GRANT ALL ON public.completion_records TO service_role;
ALTER TABLE public.completion_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own completions" ON public.completion_records FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  title text NOT NULL,
  cost int NOT NULL CHECK (cost BETWEEN 1 AND 100000),
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.rewards TO authenticated;
GRANT ALL ON public.rewards TO service_role;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own rewards select" ON public.rewards FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own rewards insert" ON public.rewards FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own rewards update" ON public.rewards FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.point_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount int NOT NULL,
  kind text NOT NULL CHECK (kind IN ('earn','reversal','redeem')),
  label text NOT NULL,
  completion_id uuid REFERENCES public.completion_records(id),
  reward_id uuid REFERENCES public.rewards(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind IN ('earn','reversal') AND completion_id IS NOT NULL) OR (kind = 'redeem' AND reward_id IS NOT NULL))
);
CREATE INDEX ON public.point_transactions(user_id, created_at DESC);
GRANT SELECT ON public.point_transactions TO authenticated;
GRANT ALL ON public.point_transactions TO service_role;
ALTER TABLE public.point_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tx" ON public.point_transactions FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Ledger is append-only
CREATE OR REPLACE FUNCTION public.forbid_change() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'point_transactions is append-only'; END $$;
CREATE TRIGGER tx_immutable BEFORE UPDATE OR DELETE ON public.point_transactions FOR EACH ROW EXECUTE FUNCTION public.forbid_change();

CREATE OR REPLACE FUNCTION public.get_balance() RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(SUM(amount),0)::int FROM public.point_transactions WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.check_in(p_goal_id uuid, p_date date) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE g public.goals; c_id uuid; cnt int; wk date;
BEGIN
  SELECT * INTO g FROM public.goals WHERE id = p_goal_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Goal not found'; END IF;
  IF g.paused OR g.archived THEN RAISE EXCEPTION 'Goal is paused'; END IF;
  IF g.kind = 'daily' THEN
    SELECT count(*) INTO cnt FROM public.completion_records WHERE goal_id = g.id AND completed_on = p_date AND undone_at IS NULL;
    IF cnt > 0 THEN RAISE EXCEPTION 'Already checked in today'; END IF;
  ELSE
    wk := date_trunc('week', p_date)::date;
    SELECT count(*) INTO cnt FROM public.completion_records WHERE goal_id = g.id AND completed_on >= wk AND completed_on < wk + 7 AND undone_at IS NULL;
    IF cnt >= g.target THEN RAISE EXCEPTION 'Weekly target already reached'; END IF;
  END IF;
  INSERT INTO public.completion_records(user_id, goal_id, completed_on, points) VALUES (auth.uid(), g.id, p_date, g.points) RETURNING id INTO c_id;
  IF g.points > 0 THEN
    INSERT INTO public.point_transactions(user_id, amount, kind, label, completion_id) VALUES (auth.uid(), g.points, 'earn', g.title, c_id);
  END IF;
  RETURN c_id;
END $$;

CREATE OR REPLACE FUNCTION public.undo_check_in(p_goal_id uuid, p_date date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE g public.goals; c public.completion_records; wk date;
BEGIN
  SELECT * INTO g FROM public.goals WHERE id = p_goal_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Goal not found'; END IF;
  IF g.kind = 'daily' THEN
    SELECT * INTO c FROM public.completion_records WHERE goal_id = g.id AND completed_on = p_date AND undone_at IS NULL ORDER BY created_at DESC LIMIT 1;
  ELSE
    wk := date_trunc('week', p_date)::date;
    SELECT * INTO c FROM public.completion_records WHERE goal_id = g.id AND completed_on >= wk AND completed_on < wk + 7 AND undone_at IS NULL ORDER BY created_at DESC LIMIT 1;
  END IF;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Nothing to undo'; END IF;
  UPDATE public.completion_records SET undone_at = now() WHERE id = c.id;
  IF EXISTS (SELECT 1 FROM public.point_transactions WHERE completion_id = c.id AND kind = 'earn') THEN
    INSERT INTO public.point_transactions(user_id, amount, kind, label, completion_id) VALUES (auth.uid(), -c.points, 'reversal', g.title, c.id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.redeem_reward(p_reward_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.rewards; bal int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(auth.uid()::text));
  SELECT * INTO r FROM public.rewards WHERE id = p_reward_id AND user_id = auth.uid() AND NOT archived;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reward not found'; END IF;
  SELECT COALESCE(SUM(amount),0) INTO bal FROM public.point_transactions WHERE user_id = auth.uid();
  IF bal < r.cost THEN RAISE EXCEPTION 'Not enough points'; END IF;
  INSERT INTO public.point_transactions(user_id, amount, kind, label, reward_id) VALUES (auth.uid(), -r.cost, 'redeem', r.title, r.id);
END $$;

REVOKE EXECUTE ON FUNCTION public.get_balance(), public.check_in(uuid,date), public.undo_check_in(uuid,date), public.redeem_reward(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_balance(), public.check_in(uuid,date), public.undo_check_in(uuid,date), public.redeem_reward(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.seed_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.goals(user_id, title, kind, target, points) VALUES
    (NEW.id, 'Drink 2L of water', 'daily', 1, 5),
    (NEW.id, 'Read for 20 minutes', 'daily', 1, 10),
    (NEW.id, '10-minute stretch', 'daily', 1, 5),
    (NEW.id, 'No phone after 10pm', 'daily', 1, 10),
    (NEW.id, 'Strength training', 'weekly', 3, 25),
    (NEW.id, 'Cook a meal at home', 'weekly', 4, 15);
  INSERT INTO public.rewards(user_id, title, cost) VALUES
    (NEW.id, 'Specialty coffee', 60),
    (NEW.id, 'Movie night', 150),
    (NEW.id, 'New book', 300),
    (NEW.id, 'Massage', 800);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.seed_new_user() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created_seed AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.seed_new_user();
