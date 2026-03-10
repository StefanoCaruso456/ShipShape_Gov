# Create Issue Request Flow

## Plain English

More clearly:

1. User clicks **Create Issue**
2. Frontend sends a **POST** request to the API
3. Backend validates the request
4. Backend inserts a new row in the database, usually into `documents`
5. Backend returns the created issue as JSON
6. Frontend uses that response to update the UI

So:

- frontend requests the creation
- backend performs the creation
- database stores it
- backend returns the result
- frontend re-renders from that returned data

## Mermaid Diagram

```mermaid
sequenceDiagram
    actor User
    participant Web as "web/ (React frontend)"
    participant API as "api/ (Express backend)"
    participant DB as "PostgreSQL"

    User->>Web: Click "Create Issue"
    Web->>API: POST /api/issues
    API->>API: Validate request
    API->>DB: INSERT new issue row
    DB-->>API: Created row
    API-->>Web: JSON response with created issue
    Web-->>User: UI updates with new issue
```

## Mental Model

The frontend does **not** write to the database directly.

The frontend asks the backend to create the issue.
The backend is the layer that validates, writes to the database, and returns the result.
