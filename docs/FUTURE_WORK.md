# Future work

- Complete authenticated Playwright coverage against a disposable PostgreSQL/Supabase environment, including two-manager conflicts and staff invitation redemption.
- Expand restaurant schedules from one daily range to weekday hours, split shifts, overnight service, and dated exceptions.
- Calibrate explainable wait suggestions from persisted dining, cleaning, queue, and reservation history; do not introduce ML until it proves measurable value.
- Add an optional configured messaging provider with separate Pending, Delivered, and Failed delivery states. Queue status must remain independent.
- Continue mobile/tablet accessibility verification, especially 360 px rush-mode operations and keyboard/focus behavior.
- Add measured query/index tuning and optional aggregate summaries only if production analytics volume requires them.

POS, ordering, inventory, payroll, accounting, payments, delivery, reviews, and AI prediction remain out of scope unless the product scope is explicitly expanded.
