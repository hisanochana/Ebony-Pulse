# Security Specification: Ebony Holdings Factory Performance

## 1. Data Invariants
- Invariant 1: Only authenticated users with verified email addresses may interact with production and user records.
- Invariant 2: User profile role escalation is strictly forbidden. Users cannot set themselves as admin. Only designated Central Administrators (`hisanochana@gmail.com` or users with `role == 'admin'`) can approve user registrations and update roles.
- Invariant 3: Downtime logs require valid string IDs, a positive minutes value, and mandatory fields (`id`, `date`, `factory`, `line`, `minutes`).
- Invariant 4: Daily production records cannot have negative output numbers, and must specify factory, date, and product.
- Invariant 5: System application configurations (`appConfig`) can only be modified by Central Administrators.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Read on Users**: Anonymous user tries to list all employee records -> `PERMISSION_DENIED`.
2. **Unauthenticated Write on Downtime**: Anonymous user attempts to inject downtime records -> `PERMISSION_DENIED`.
3. **Privilege Escalation on User Creation**: Operator attempts to create a user document with `role: "admin"` -> `PERMISSION_DENIED`.
4. **Self-Role Elevation on User Update**: Operator attempts to update their own `role` field from `"operator"` to `"admin"` -> `PERMISSION_DENIED`.
5. **ID Poisoning Attack**: Attacker injects a 2KB junk character string into document path ID -> `PERMISSION_DENIED`.
6. **Negative Downtime Minutes**: Malicious user submits negative downtime duration (`minutes: -50`) -> `PERMISSION_DENIED`.
7. **Missing Mandatory Fields on Downtime**: User submits downtime log without `factory` or `line` -> `PERMISSION_DENIED`.
8. **Shadow Field Injection**: User submits downtime log containing arbitrary ghost fields (e.g. `bypassSecurity: true`) -> `PERMISSION_DENIED`.
9. **Unverified Email Access**: User with unverified email attempts to update production data -> `PERMISSION_DENIED`.
10. **Non-Admin Config Modification**: Operator tries to overwrite Google Sheet sync URL in `/appConfig/sheet` -> `PERMISSION_DENIED`.
11. **Unauthorized Downtime Deletion**: Standard operator attempts to delete another supervisor's downtime entry -> `PERMISSION_DENIED`.
12. **Negative Production Target**: Client pushes daily production record with negative `plannedQty` or `actualQty` -> `PERMISSION_DENIED`.
