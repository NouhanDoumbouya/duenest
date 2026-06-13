# Private Beta Waitlist and Invite Workflow

**Status:** Implemented  
**Scope:** Controlled early access for DueNest private beta

## Purpose

DueNest uses a waitlist and invite-code system so early access can be reviewed
and paced by the founder instead of opening registration publicly to everyone.

## Public Flow

1. A visitor opens `/waitlist`.
2. They submit name, email, persona/use case, optional country, message, and
   referral source.
3. The backend creates a `WaitlistEntry` through `POST /api/v1/waitlist/`.
4. Duplicate active entries for the same email are rejected.
5. The public response confirms waitlist submission only. It does not expose
   the waitlist list, founder notes, invite metadata, or registered-user state.

## Founder Review Flow

1. Founder opens `/founder/waitlist`.
2. Founder filters by status, persona, country, or search.
3. Founder can update status and founder notes.
4. Founder can create an invite for a waitlist entry.
5. Creating an invite marks the entry `invited`, links the invite code, and
   records a founder audit log.
6. The UI exposes a copyable `/invite/:code` link.

## Invite Signup Flow

1. Invite recipient opens `/invite/:code`.
2. The frontend validates the code with `POST /api/v1/invites/validate/`.
3. Valid invites continue to `/register?invite=:code`.
4. When `PRIVATE_BETA_ENABLED=true`, password registration requires a valid
   invite code.
5. First-time Google account creation also requires a valid invite code when
   private beta mode is enabled.
6. Existing users can still log in, and existing accounts can still be linked to
   Google without consuming a new invite.
7. Successful signup creates an `InviteCodeUse`, increments `used_count`, and
   marks any matching active waitlist entry `accepted`.

## Invite Rules

Invite codes are rejected when:

- the code does not exist
- `is_active=false`
- `expires_at` is in the past
- `used_count >= max_uses`

Founder can disable a code from `/founder/invites`.

## Email Handling

Transactional email is not configured yet.

Backend hooks exist for:

- waitlist confirmation email
- invite email

Until an email provider is added, the founder copies invite links from Founder
Console and sends them manually.

## Privacy and Security

- Waitlist list and invite management are founder-only.
- Public validation returns invite health only.
- Public waitlist submission does not reveal whether an email has a user account.
- Product events are privacy-minimized.
- Invite and founder actions are logged for operational visibility.
- Public waitlist and invite validation endpoints use DRF scoped throttles.

## Environment

```env
PRIVATE_BETA_ENABLED=true
```

Set this on the backend to require invite codes for new account creation.

