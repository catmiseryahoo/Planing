---
name: Luminous Productivity
colors:
  surface: '#f8f9fa'
  surface-dim: '#d9dadb'
  surface-bright: '#f8f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f5'
  surface-container: '#edeeef'
  surface-container-high: '#e7e8e9'
  surface-container-highest: '#e1e3e4'
  on-surface: '#191c1d'
  on-surface-variant: '#4d4732'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f2'
  outline: '#7e775f'
  outline-variant: '#d0c6ab'
  surface-tint: '#705d00'
  primary: '#705d00'
  on-primary: '#ffffff'
  primary-container: '#ffd700'
  on-primary-container: '#705e00'
  inverse-primary: '#e9c400'
  secondary: '#0c6780'
  on-secondary: '#ffffff'
  secondary-container: '#9ae1ff'
  on-secondary-container: '#09657f'
  tertiary: '#006e20'
  on-tertiary: '#ffffff'
  tertiary-container: '#8af08b'
  on-tertiary-container: '#006e20'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffe16d'
  primary-fixed-dim: '#e9c400'
  on-primary-fixed: '#221b00'
  on-primary-fixed-variant: '#544600'
  secondary-fixed: '#baeaff'
  secondary-fixed-dim: '#89d0ed'
  on-secondary-fixed: '#001f29'
  on-secondary-fixed-variant: '#004d62'
  tertiary-fixed: '#93f993'
  tertiary-fixed-dim: '#77dc7a'
  on-tertiary-fixed: '#002105'
  on-tertiary-fixed-variant: '#005316'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
typography:
  display-lg:
    fontFamily: Montserrat
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Montserrat
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Montserrat
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Montserrat
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-margin-mobile: 20px
  container-margin-desktop: 40px
  gutter: 16px
  stack-sm: 12px
  stack-md: 24px
  stack-lg: 48px
---

## Brand & Style

The design system is built to transform task management from a chore into a rewarding, upbeat experience. The brand personality is **optimistic, energetic, and supportive**, targeting individuals who seek a "digital sunshine" approach to their daily workflow. 

The aesthetic identity is a hybrid of **Minimalism and Soft Glassmorphism**. It prioritizes heavy white space and a clean structural foundation to maintain clarity, while injecting personality through vibrant accent colors and translucent, layered surfaces. The emotional goal is to reduce cognitive load and "to-do list anxiety" by using a soft, approachable visual language that feels more like a lifestyle companion than a corporate utility.

## Colors

This design system utilizes a high-vibrancy palette set against a calming, neutral backdrop to ensure high legibility without sacrificing its energetic core.

- **Primary (Energetic Yellow):** Reserved for the "hero" actions—creating new tasks, primary buttons, and active progress indicators. It represents energy and focus.
- **Secondary (Sky Blue):** Used for navigation elements, categorization tags, and secondary interactive states. It provides a cooling balance to the yellow.
- **Tertiary (Mint Green):** Strictly applied to success states, completed tasks, and positive reinforcement feedback loops.
- **Surface & Background:** The background uses a soft off-white (`#F8F9FA`) to prevent the starkness of pure white, while card surfaces remain pure white to create subtle separation.

## Typography

The typographic strategy pairs the geometric confidence of **Montserrat** for headings with the systematic clarity of **Inter** for functional text.

Headings are treated with bold weights and tight letter-spacing to create a sense of urgency and importance for goal-setting. Body text is optimized for rapid scanning, using generous line heights to ensure the interface feels "airy." On mobile devices, headline sizes scale down significantly to ensure task titles remain visible without excessive wrapping, while body text remains at 16px to ensure accessibility for all users.

## Layout & Spacing

The layout follows a **fluid grid system** with an 8px base unit. 

- **Mobile:** A 4-column grid with 20px outside margins. Tasks are usually displayed as full-width cards to maximize tap targets.
- **Desktop:** A 12-column grid. The layout shifts to a multi-column dashboard where the left sidebar handles navigation and the right panel provides task details.
- **Rhythm:** Vertical spacing between task cards is kept tight (12px) to show list density, while section spacing is wide (48px) to provide visual breathing room between "Today" and "Upcoming" categories.

## Elevation & Depth

Hierarchy is established through **Ambient Shadows** and **Glassmorphism**. 

Cards do not use harsh borders; instead, they sit on the off-white background with a very soft, diffused shadow (`0px 10px 30px rgba(0,0,0,0.04)`). To imply further depth for modal overlays or sticky headers, a `backdrop-filter: blur(12px)` is applied to semi-transparent white surfaces (`rgba(255, 255, 255, 0.8)`). This creates a sense of "lightness" as if the interface is made of semi-translucent, floating layers of frosted glass.

## Shapes

The shape language is defined by **Rounded** geometry. 

Standard task cards and input fields use a 0.5rem (8px) radius, while "Primary Action" buttons and progress bars utilize the `rounded-xl` (1.5rem / 24px) setting to create a more friendly, pill-like appearance. This high degree of curvature removes any "sharpness" from the UI, reinforcing the friendly and inviting nature of the design system.

## Components

- **Buttons:** Primary buttons are pill-shaped with a solid Energetic Yellow fill and dark text. Secondary buttons use a Sky Blue ghost style with a 1.5px border.
- **Task Cards:** Pure white containers with soft shadows. When a task is hovered or swiped, a subtle Sky Blue glow is applied to the shadow.
- **Chips/Tags:** Used for task categories (e.g., "Work," "Personal"). These use a semi-transparent version of the category color with high-contrast text.
- **Checkboxes:** Large, circular checkboxes. When checked, they transition from a Sky Blue outline to a solid Mint Green fill with a bouncy "pop" animation.
- **Input Fields:** Minimalist design with a focus state that adds a 2px Sky Blue bottom border and a subtle glassmorphic background tint.
- **Progress Bars:** Thick, rounded tracks with a gradient fill moving from Sky Blue to Mint Green as the task completion percentage increases.
- **Playful Icons:** Use a consistent "Line-and-Dot" style with rounded terminals to match the typography and shape language.