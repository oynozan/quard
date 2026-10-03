// The dashboard's sample data is fixed, so these ids always exist
export const RUN = "/runs/4bf92f3577b34da6a3ce929d0e0e4736";
export const STEP = "5ec7bcf05ef6550e";
export const NAV = 'aside[aria-label="Main navigation"]';
export const DIALOG = '[role="dialog"]';

// Dashboard panes carry their title as an aria-label
export const section = (label: string) => `section[aria-label="${label}"]`;
