# Data model

- `Restaurant`: customer-facing restaurant details, crowd level, wait estimate, and walk-in status.
- `LayoutItem`: an item placed in a restaurant layout, such as a table, bar seat, or waiting area.
- `QueueEntry`: a waiting customer group with a group size, arrival time, and queue status.
- `AnalyticsSummary`: high-level manager metrics including occupancy and estimated wait time.

The string-union types for statuses live in `lib/types.ts`, making allowed values easy to find and extend.
