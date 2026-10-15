# Student Todo App — Step 1

A small MERN todo app with email/password registration, cookie-based JWT login, private todos, date-grouped lists, pagination, completion notes, and a persistent light/dark theme.

## Requirements

- Node.js 20+
- MongoDB running locally or a MongoDB connection string

## Setup

1. Fill in the root `.env` file with your MongoDB Atlas connection string in `MONGODB_URI` and a strong `JWT_SECRET` (at least 32 characters). `MONGODB_DB_NAME` is set to `Todo_manager` to match your Atlas database; leave it as-is unless you want a different database. The server reads this root file even when started from the `server/` directory.
2. Install dependencies:

   ```sh
   cd server && npm install
   cd ../client && npm install
   ```

3. Start the API and frontend in separate terminals:

   ```sh
   cd server && npm run dev
   ```

   ```sh
   cd client && npm run dev
   ```

4. Open the Vite URL shown in the terminal (normally `http://localhost:5173`).

The server listens on port `5000` by default. The browser communicates with it through the Vite `/api` proxy, and the JWT is stored only in an HTTP-only cookie. Mongoose writes app data into the `Todo_manager` database, in separate `users` and `todos` collections. The root `.env` is ignored by Git; `.env.example` documents the required variables.

## Step 1 features

- Register and login with email and password; passwords are bcrypt-hashed. Password fields have show/hide buttons.
- Authenticated dashboard with Add Todo, All Todos, Pending, and Completed tabs.
- Create todos with title, description, priority, and due date.
- Complete a todo with an optional note, or return it to pending.
- Todos are always scoped to the authenticated user, paginated by the API, and grouped by due date in the UI.
- Theme toggle and logout. Direct dashboard visits without a valid session redirect to login.

List APIs accept `page`, `limit`, optional `status`, and optional `date=YYYY-MM-DD` query parameters.
# Todo-Manager
