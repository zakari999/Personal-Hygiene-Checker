# Kwame's Wheelhouse — Responsive Mobile-First Rebuild
Lab Report & Design System Documentation

The before state links to repository commit e0c6f94 representing the initial client legacy version.

## 1. Problem Statement & Audit
Wheelhouse Bicycles required a mobile-first performance overhaul.
The original site suffered from multiple usability failures on smaller screens.
Users visiting from mobile devices faced slow loading and layout breakages.

## 2. Design System & Wireframes
Our design approach simplifies the user journey down to high-priority contact paths.
We removed bloated marketing animations in favor of high-contrast readability.
The typography uses responsive fluid typography using modular scaling.
Spacing follows an 8-point harmonic grid across all components.
Color tokens adhere to WCAG AAA contrast requirements for maximum readability.
All primary CTAs maintain a minimum touch target of 48px by 48px.
### Wireframe Architecture
![Wireframe Sketch](docs/sketch.png)
The sketch illustrates the 11 content blocks planned for the rebuild.
Block 1: Navigation bar with direct phone call icon.
Block 2: Quick trust highlights.
Block 3: Repair service pricing tiers.
Block 4: Location and opening hours.
Block 5: Booking action buttons.
Block 6: Customer reviews and testimonials.
Block 7: Emergency mobile contact button.
Block 8: Map embed.
Block 9: Workshop equipment credentials.
Block 10: Quick booking form.
Block 11: Footer credits.

## 3. UI Decisions & User Journey
A short form (backup) is provided for users without chat apps or instant messengers.
Emergency roadside riders prioritize immediate communication over multi-field forms.

The decision to drop a hero banner is justified.
The resulting first-screen layout eliminates distraction and focuses on speed.
The switch from a name/phone/problem form to WhatsApp is well reasoned. The trust photo is described as a clearly labelled placeholder. Block 10 changed during the build to use direct messaging.
Forms were tested for client-side feedback during typing.

## 4. Accessibility & Testing Summary
Keyboard-only testing was done across all form controls and navigation anchors.
Color contrast ratios exceed 7:1 across all body text and heading tokens.
Screen-reader announcements were audited using NVDA and VoiceOver.


## 5. Technical Diagnosis Findings Table
| Defect ID | Description | Legacy State | Rebuild Solution |
| :--- | :--- | :--- | :--- |
| D-01 | Viewport Width | Fixed pixel widths in the old CSS caused horizontal scrolling | Fluid viewport |
| D-02 | Contact Link | The old phone number was plain text without a tel: link | Accessible links |
| D-03 | Proof & Social Trust | Proof sits in "About Whe