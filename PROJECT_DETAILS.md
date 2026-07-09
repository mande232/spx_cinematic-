# SPX Cinematic Welcome — Project Details

## Overview

This project is an interactive **SPX reception / cinematic welcome experience** built as a single-page web application. It simulates a visitor journey where a guest scans a QR code, opens a mobile-style flow, captures a portrait, and sees themselves placed into a cinematic LED wall sequence.

The application currently behaves like a **prototype / experience demo**, but it already contains a strong UI structure, route setup, server entry handling, and theme support.

---

## Core Purpose

The experience is designed to:

1. attract attention on a large LED wall
2. guide a visitor to scan a QR code
3. transition the visitor into a phone-like interface
4. collect a name and a camera portrait
5. simulate background removal / rendering
6. play back a cinematic chapter sequence
7. end with a souvenir and follow-up action buttons

---

## Tech Stack

### Framework / runtime
- **React 19**
- **TypeScript**
- **Vite**
- **TanStack Start**
- **TanStack Router**
- **TanStack React Query**

### Styling / UI
- **Tailwind CSS v4**
- **tw-animate-css**
- **shadcn/ui** component configuration
- **Radix UI** primitives
- **Lucide React** icons available

### Tooling
- ESLint
- Prettier
- Bun lock/runtime support

---

## Project Structure

### Root
- `package.json` — scripts, dependencies, app metadata
- `vite.config.ts` — Vite setup
- `tsconfig.json` — TypeScript config
- `eslint.config.js` — lint rules
- `components.json` — shadcn/ui config
- `bun.lock`, `bunfig.toml` — Bun support
- `PROJECT_DETAILS.md` — this documentation file

### Public
- `public/favicon.ico`

### Source
- `src/start.ts` — TanStack Start bootstrap and error middleware
- `src/server.ts` — SSR/server wrapper and catastrophic error fallback
- `src/router.tsx` — router creation and QueryClient context
- `src/routeTree.gen.ts` — generated TanStack Router tree
- `src/styles.css` — global theme tokens, animations, and base styling
- `src/routes/__root.tsx` — root document shell
- `src/routes/index.tsx` — main landing/experience implementation
- `src/routes/README.md` — route conventions only

### Supporting folders
- `src/assets/` — LED chapter imagery
- `src/components/` — reusable UI components
- `src/hooks/` — custom hooks
- `src/lib/` — utilities and error helpers

---

## Routing Model

This app currently has a **single main route**:

- `/` → `src/routes/index.tsx`

TanStack Start uses **file-based routing**, and the route tree is generated automatically in:

- `src/routeTree.gen.ts`

The root shell is defined in:

- `src/routes/__root.tsx`

That root shell provides:
- page metadata
- stylesheet and font links
- QueryClientProvider
- not found UI
- route error UI

---

## Experience Flow

The application is driven by a client-side state machine.

### Experience states

Defined in `src/routes/index.tsx`:

```ts
type ExperienceState =
  | "idle"
  | "scanned"
  | "camera_ready"
  | "countdown"
  | "capturing"
  | "processing"
  | "rendering"
  | "playing"
  | "completed"
  | "error";
```

### State flow

1. **idle**
   - LED wall shows welcome prompt and QR code
   - phone panel shows instructions to scan

2. **scanned**
   - mobile onboarding becomes active
   - optional visitor name can be entered
   - camera permission prompt CTA appears

3. **camera_ready**
   - camera preview is active
   - user is prompted to capture their portrait

4. **countdown**
   - countdown animation runs

5. **capturing**
   - snapshot is taken from the video stream

6. **processing**
   - simulated cut-out / processing UI

7. **rendering**
   - simulated rendering / scene assembly UI

8. **playing**
   - cinematic chapters advance automatically on the LED side

9. **completed**
   - souvenir appears
   - mobile action buttons are shown

10. **error**
   - fallback if camera permission or access fails

---

## Content Model

### Chapter type

```ts
type Chapter = {
  id: string;
  title: string;
  caption: string;
  image: string;
};
```

### Current chapters

1. The Harvest
2. Intelligence
3. Living Sciences
4. Powering Africa
5. In Motion
6. Future Forward

These are stored in the `CHAPTERS` constant in `src/routes/index.tsx`.

---

## Major UI Areas

## 1. Header

The header includes:
- SPX brand block
- experience subtitle
- theme toggle
- live session label
- location label

The header is fixed and the page content is padded downward to avoid overlap.

## 2. LED wall area

The LED wall is the main cinematic surface. It includes:
- background chapter imagery
- vignette overlay
- recording/live indicator
- playback chapter marker
- idle welcome content
- processing / rendering messages
- playback chapter content
- completed state title

### QR handoff behavior

The QR scan remains on the **same page**, but the app now simulates a more realistic handoff by:
- switching to `scanned`
- showing a short-lived “connected / phone linked” visual state on the LED side
- guiding the visitor to continue on the phone side

## 3. Phone/mobile panel

The phone panel simulates the visitor’s mobile experience.

It includes:
- idle instructions
- visitor name input
- camera enable CTA
- capture UI
- processing UI
- playback state status
- completed state souvenir and action buttons

## 4. Operator/debug panel

Below the phone mockup is a collapsible operator/debug panel.

It currently allows:
- viewing current state
- jumping to a state manually
- resetting the session

---

## Post-Experience Actions

In the **completed** mobile state, the following UI-only buttons exist:

- Visit SPX Website
- Download Company Profile
- Explore Our Projects
- Connect With SPX

These are currently visual placeholders and are **not yet wired** to real URLs/files.

---

## Camera / Capture Behavior

Portrait capture uses browser media APIs:

- `navigator.mediaDevices.getUserMedia()`
- a hidden `<canvas>` to capture a frame
- image output stored as a base64 data URL

The current behavior:
- requests front-facing camera
- mirrors the preview for selfie alignment
- captures to JPEG via canvas

---

## Theme System

Theme behavior is managed through:

- `theme` React state in `src/routes/index.tsx`
- localStorage key: `spx-theme`
- `document.documentElement.classList.toggle("dark", ...)`

### Theme modes
- **light**
- **dark**

### Theme tokens

Defined in `src/styles.css`:
- `--background`
- `--foreground`
- `--surface`
- `--card`
- `--primary`
- `--secondary`
- `--muted`
- `--accent`
- `--border`
- `--ring`

The light theme has been adjusted to use a warmer, softer palette. The dark theme remains deep and cinematic.

---

## Animations and Visual Effects

Global animations in `src/styles.css` include:

- `cinematic-entrance`
- `soft-pulse`
- `kenburns`
- `shimmer`

Used visual effects include:
- letterbox bars
- grain overlay
- glass panels
- vignette gradients
- pulse/live indicators

---

## Error Handling

### Client route error handling

Defined in `src/routes/__root.tsx`:
- custom route error component
- custom not found component

### Server/runtime error handling

Defined in:
- `src/start.ts`
- `src/server.ts`

These files handle:
- middleware-level server exceptions
- catastrophic SSR failures
- conversion of server failures into a custom HTML error page

Related utilities:
- `src/lib/error-page.ts`
- `src/lib/error-capture.ts`
- `src/lib/lovable-error-reporting.ts`

---

## Current UX Improvements Already Made

The project has already been refined with multiple UX adjustments, including:

- smaller circular guest image on LED playback
- theme toggle support
- cleaner light theme palette
- reduced phone/control panel width and height
- LED content compaction to avoid clipping
- improved light-theme header/footer readability
- QR handoff indicator on the LED side
- mobile completed-state action button group
- lighter LED overlays for light theme
- more readable operator/debug labels in light theme

---

## Known Prototype Limitations

This is still a front-end prototype in several areas.

### Not yet implemented
- real QR scanning destination / deep link
- real mobile-only route or external handoff URL
- real backend processing for background removal
- real rendering pipeline
- persistent storage
- analytics
- action button link wiring
- production-ready operator tooling separation

### Simulated behaviors
- QR scan
- rendering timeline
- chapter progression timing
- post-processing flow

---

## Important Files to Know

### Experience logic
- `src/routes/index.tsx`

### Root shell
- `src/routes/__root.tsx`

### Theme and global styling
- `src/styles.css`

### Router setup
- `src/router.tsx`
- `src/routeTree.gen.ts`

### Server/bootstrap
- `src/start.ts`
- `src/server.ts`

### Route documentation
- `src/routes/README.md`

---

## Suggested Next Improvements

If this project continues, the most useful next steps would be:

1. wire the completed-state action buttons to real URLs/files
2. create a true mobile route or device-specific page for QR handoff
3. separate large UI sections in `src/routes/index.tsx` into reusable components
4. add analytics or session tracking
5. replace simulated processing/rendering with real services
6. create a production-safe operator mode
7. add accessibility review for contrast, focus, and motion preferences

---

## Summary

This project is a **cinematic single-route visitor onboarding experience** for SPX. It combines:

- a large-format LED wall interface
- a phone-style visitor flow
- browser camera capture
- cinematic chapter playback
- theme-aware UI styling
- SSR-ready TanStack Start architecture

It currently functions as a polished interactive prototype with strong front-end structure and room for production integration.