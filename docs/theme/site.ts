import { tokens } from "./tokens";

// Signal Green (#00DA71) as Nextra's primary color, in HSL
export const SIGNAL = { hue: 151.1, saturation: 100, lightness: 42.7 };

// The site is dark only, so both slots get the page color
export const BACKGROUND = { dark: tokens.page, light: tokens.page };
