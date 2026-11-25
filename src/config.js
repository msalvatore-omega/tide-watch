// Address of the Tidely alerts server (Cloudflare Worker, see server/).
// Empty = no background alerts; notifications then only work while the app is open.
// Can be overridden at build time with VITE_ALERTS_API.
export const ALERTS_API = import.meta.env.VITE_ALERTS_API ?? ''
