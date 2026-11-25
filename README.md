# Steady Reward

Personal Goal & Reward App — MVP. Build a clean, modern, responsive personal goal-tracking web app to help me consistently achieve daily habits and weekly goals through progress tracking and a self-defined reward system. Start by scaffolding the app and building the visual shell, mobile navigation, and balance badge.

### Locked
- **Design & Tone:** Premium minimalist, motivating without feeling childish or overly gamified. Muted slate/stone neutral palette with warm amber and subtle emerald accents for achievements. Clean typography, strong visual hierarchy, mobile-first responsive container, subtle feedback. Avoid excessive animations.
- **Tech Stack:** Vite + React 18.3, TypeScript 5.6, Tailwind CSS 3.4, shadcn/ui (Radix primitives), Lucide React icons, TanStack Query.
- **Persistence & Auth:** Cloud persistence with instant guest access so users can immediately track habits and rewards without forced signup, with the ability to link credentials later.
- **Data Architecture:** Strictly separated relational entities (`goals`, `completion_records`, `rewards`, `point_transactions`). Points balance is strictly derived from an immutable transaction ledger (`point_transactions`), ensuring point values and balances never drift or corrupt.
- **Weekly Goals Interaction:** Progressive counter (e.g. `+` button incrementing weekly sessions toward target `1/3`, `2/3`, `3/3`).
- **Visual Shell & Navigation:**
  - Header: Clean app title/branding, a polished point balance pill badge (`[Sparkle icon] 120 pts`), and a mini progress teaser towards the next reward.
  - Bottom Tab Navigation (mobile-optimized bar, floating or pinned):
    - Dashboard (Today's check-ins, progress ring, momentum)
    - Goals (Daily habits & weekly targets management)
    - Rewards (Self-defined rewards catalog with affordability states)
    - History (Transaction ledger stream & weekly consistency review)
  - Responsive layout shell: Centered comfortable max-width on tablet/desktop, native-feeling app frame on mobile.

### Open
- Initial dashboard structure with today's habits check-in list, weekly targets section, and daily progress gauge.
- Realistic default seed goals and rewards for instant interactivity on first load.
- Micro-interactions (haptic/visual feedback on check-in, smooth balance increment animation).

build a real working app, not a clickable prototype; the screen and kit files show layout, content and look (a wireframe's, structure only) and are never code to copy. The screens are the moments the user designed, not the whole product. Before building, walk through each flow as its user would and design what the pictures leave out, as a product designer would for this product: the steps a flow needs to finish and how the app responds to what the user does, including the moments its users will actually run into, like waiting on something or finding nothing yet. Add nothing a user of this product would never meet, and keep an app the user wants simple, simple. Never leave a step the product's core flows need as "coming soon", unless the brief says the user chose to. Where such a step needs an outside service, build every part up to it and say in your reply what's left to connect. Fill product gaps only, never a look the design set: an added step reuses the UI kit's tokens, chrome and parts and the nearest designed screen's layout, with no new visual direction. Look at every screen's picture before writing code; design.md says which picture or sheet holds each screen. Open the UI kit's shells and parts HTML for the header, tab bar, composer and components, not only its tokens. Use each finished screen's copy exactly as design.md lists it; never invent copy for one. A wireframe under design.md's Wireframes gives structure only: build it in the design's look, as design.md says. The screens' photos are placeholders for the mockups only: replace every photo design.md lists with the user's own upload for it, else as design.md says (a photo without people re-composed with imagegen--edit_image from it as a reference, a photo of people generated from its brief and never from the photo), and ship no set photo or its URL. For a design that came with no design.md, every photo on assets.lovable.dev or images.unsplash.com is a set photo: replace it with the user's own upload for it, else a new image generated for its slot, any person in it one who doesn't exist, never from the photo or a picture showing it. Build and check each screen at the canvas it was drawn at: phone 393×764, tablet landscape 1133×744, tablet portrait 744×1133, desktop 1280×832. After building, screenshot the app at those sizes and states, compare each finished screen with its picture, and fix every visual difference you didn't choose; check a wireframe's screen against its structure, never its grey look. End your reply with "Changed from the mockups": each deliberate change and why, and "Added beyond the mockups": each step, state or interaction you built that no screen shows.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9755166f-a7a3-4cb1-a0bb-de0d9e61853c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
