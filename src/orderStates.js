// Ordered state progressions for each kind of order.
// STATE_ORDER is the regular (printed) order flow. When pure-blank orders get
// their own states, add e.g. BLANK_STATE_ORDER here and pass it to <StateFlow>.
export const STATE_ORDER = ['building', 'sent', 'pending', 'fulfilled', 'received', 'shipped'];
