# Security Specification

## Data Invariants
- `messages`: Can only be created. No reading, updating, or deleting from the client. Must have valid name, email, and message.
- `analytics`: Can only be created. No reading, updating, or deleting from the client.

## The "Dirty Dozen" Payloads (Deny cases)
1. Message with missing `email`.
2. Message with `isVerified: true` shadow field.
3. Message with 2MB message string.
4. Analytic event with `timestamp` in the future.
5. Analytic event attempting to update an existing record.
6. message with `messageId` that is too long or contains special characters.
7. message with `createdAt` as a client-provided hardcoded string instead of server timestamp.
8. update to `analytics` doc.
9. delete of `messages` doc.
10. list of `messages` doc.
11. list of `analytics` doc.
12. get of `messages` doc by non-admin.

## The Test Runner
A `firestore.rules.test.ts` would verify these. Since I am implementing rules now, I will ensure they are locked down.

# Rules Draft
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Global Deny
    match /{document=**} {
      allow read, write: if false;
    }

    function isSignedIn() { return request.auth != null; }
    function isValidId(id) { return id is string && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$'); }
    function incoming() { return request.resource.data; }
    
    // Messages
    match /messages/{messageId} {
      allow create: if isValidId(messageId) &&
                      incoming().name is string && incoming().name.size() > 0 && incoming().name.size() < 100 &&
                      incoming().email is string && incoming().email.size() > 0 && incoming().email.matches('^.+@.+$') &&
                      incoming().message is string && incoming().message.size() > 0 && incoming().message.size() < 10000 &&
                      incoming().createdAt == request.time;
    }

    // Analytics
    match /analytics/{eventId} {
      allow create: if isValidId(eventId) &&
                      incoming().event is string && incoming().event.size() > 0 &&
                      incoming().timestamp == request.time;
    }
    
    // Admins (User email from runtime: contact@vinamrakumar.com)
    function isAdmin() { 
       return isSignedIn() && (request.auth.token.email == 'contact@vinamrakumar.com' && request.auth.token.email_verified == true);
    }
    
    match /messages/{messageId} {
      allow read: if isAdmin();
    }
    match /analytics/{eventId} {
      allow read: if isAdmin();
    }
  }
}
```
