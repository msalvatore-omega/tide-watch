// Feature switches.

// Phone notifications (in-app and background push via the alerts server in server/).
// On hold: set to true to bring back the "Notify me" button and all notification
// behaviour. Background alerts also need ALERTS_API below and the server deployed
// (see README → Alerts server).
export const NOTIFICATIONS_ENABLED = false

// Address of the Tidely alerts server (Cloudflare Worker, see server/).
// Empty = no background alerts; notifications then only work while the app is open.
// Can be overridden at build time with VITE_ALERTS_API.
export const ALERTS_API = import.meta.env.VITE_ALERTS_API ?? ''
