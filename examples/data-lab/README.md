# Halina Data Lab demo history

Use `halina_demo_history.csv` to populate a TEST restaurant with synthetic operational history for Analytics. It contains fake parties only—no real names, contact details, or other personal data.

1. Open `/admin`, unlock it with the configured admin credentials, then open `/admin/data-lab`.
2. Choose a TEST restaurant whose active table labels include `T1`, `T2`, `T3`, `B1`, `B2`, `P1`, `P2`, and `VIP1`. The importer deliberately rejects missing tables and capacity mismatches.
3. Choose `halina_demo_history.csv`, select **History** as the CSV template, and click **Stage and validate**.
4. Review all normalized rows and validation results, then confirm the staged batch.
5. Open Manager > Analytics to demonstrate turns, occupancy, dining duration, cleaning time, queue wait, promise error, abandonment/no-show rate, and busiest periods.

Data Lab accepts synthetic imports only for restaurants permanently marked `TEST`; test restaurants never appear in public browsing, booking, or waitlist routes. To clean up, return to the applied batch in `/admin/data-lab` and choose **Revert synthetic rows**. Reverting removes only operational rows linked to that batch and retains the immutable import/audit record.
