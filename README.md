# Student Todo App — Step 1

A MERN todo app with email/password registration, cookie-based JWT login, private todos, date-grouped lists, pagination, completion notes, a priority matrix, calendar, daily reports, recurring todos, and a persistent light/dark theme.

## Requirements

- Node.js 20+
- MongoDB running locally or a MongoDB connection string

## Setup

1. Fill in the root `.env` file with your MongoDB Atlas connection string in `MONGODB_URI` and a strong `JWT_SECRET` (at least 32 characters). `MONGODB_DB_NAME` is set to `Todo_manager` to match your Atlas database; leave it as-is unless you want a different database. The backend reads this root file even when started from the `backend/` directory.
2. Install dependencies:

   ```sh
   cd backend && npm install
   cd ../frontend && npm install
   ```

3. Start the API and frontend in separate terminals:

   ```sh
   cd backend && npm run dev
   ```

   ```sh
   cd frontend && npm run dev
   ```

4. Open the Vite URL shown in the terminal (normally `http://localhost:5173`).

The backend listens on port `5000` by default. The browser communicates with it through the frontend Vite `/api` proxy, and the JWT is stored only in an HTTP-only cookie. Mongoose writes app data into the `Todo_manager` database. The root `.env` is ignored by Git; `.env.example` documents the required variables. Set `SUPER_ADMIN_EMAILS` to the email address(es) that should receive the `SUPER_ADMIN` role. A new account registered with that email is made a super-admin, and an existing account is promoted after its next successful login. No client request can grant elevated roles.

The project code is split into `backend/` (Express API and MongoDB models) and `frontend/` (React/Vite app). Start each in a separate terminal from the project root:

```sh
cd backend && npm run dev
```

```sh
cd frontend && npm run dev
```

Open the frontend URL printed by Vite, normally `http://localhost:5173`.

## Step 1 features

- Register and login with email and password; passwords are bcrypt-hashed. Password fields have show/hide buttons.
- Authenticated dashboard with Add Todo, All Todos, Pending, and Completed tabs.
- Create todos with title, description, priority, and due date.
- Complete a todo with an optional note, or return it to pending.
- Todos are always scoped to the authenticated user, paginated by the API, and grouped by due date in the UI.
- Theme toggle and logout. Direct dashboard visits without a valid session redirect to login.

List APIs accept `page`, `limit`, optional `status`, and optional `date=YYYY-MM-DD` query parameters.

## Phase 2

- New student accounts choose **Personal use** or **Join a class** after registration. A class join request does not create membership until its assigned teacher approves it.
- Configure the initial super-admin email(s) with `SUPER_ADMIN_EMAILS`. Super-admins can create teacher accounts and classes, and assign each teacher to one class.
- To enable your own account as the first super-admin, add its login email to `SUPER_ADMIN_EMAILS` in the root `.env`, restart the backend, and log in with that email. An existing account is promoted on successful login; a new account registered using that email receives the role immediately. Create classes and teacher accounts from the **Admin** panel.
- Teachers manage requests and todos only for students who belong to their assigned class. Only class-account todos carry a class ID, so a student's personal todos are never exposed to a teacher.
- Todos default to `private`; `classmates` and `public` todos are the only todos returned on the classmates page. Approved friend access is read-only and does not disclose private todos.
- Students and friends can send access requests, and messages are limited to classmates and approved friends. The notifications page separates requests from answers.
- Run the backend authorization tests with `cd backend && npm test`. They exercise the API and assert that another student receives HTTP 403 when reading or editing a private todo.

## Phase 3

- The dashboard supports title/notes search, status/date/priority filters, named saved filters, and an **Overdue high-priority** quick filter.
- Todo priority uses four matrix quadrants: **Urgent + Important**, **Important, not Urgent**, **Urgent, not Important**, and **Neither**. Existing `high`/`medium`/`low` records are shown as urgent+important / important-not-urgent / neither until they are changed.
- **Calendar** shows a monthly view with a dot on dates containing todos. Selecting a date lists its todos and supports adding or editing a todo, including its due date.
- **Matrix** displays active todos in their four priority quadrants. **Reports** shows a chosen date's total, completed, pending, completion percentage, and a Recharts bar chart.
- Todos can include a checklist and repeat daily, weekly, or monthly. Completing a recurring todo creates the next occurrence; monthly recurrences clamp to the last valid day of a shorter month.
- Deleting a todo moves it to **Trash**. Restore is reversible; permanent deletion requires confirmation.
- Task history records creation, edits, status changes, deletion, restoration, and permanent deletion. Update entries contain old/new field values, including due dates.
- Teachers can open **Audit log** to see their own edits, status changes, and deletions of todos belonging to students in their assigned class. Teacher audit access is role- and class-scoped.
- Daily reports are available at `GET /api/todos/reports/daily?date=YYYY-MM-DD`; saved filters are private to the authenticated user. The calendar and matrix APIs also return only the authenticated user's active todos.
- Run verification with `cd backend && npm test` and `cd frontend && npm run build`.

## Phase 4

- **My Day** is the default student dashboard. It shows today's and overdue todos, the top three priorities, daily completion progress, habits, category progress, XP, and the current streak.
- **Focus** offers an explicit-start countdown with configurable focus, short-break, and long-break durations. Focus time is logged against a selected todo only after the user confirms the actual minutes; manual time logging is also available.
- Todos can store estimated minutes, actual minutes, a personal category, and prerequisite todo IDs. The API rejects completion while a prerequisite is pending. First-time completion awards 10 XP.
- Streaks qualify when at least 80% of a user's active todos due on that UTC date are completed. Daily records and streak history are private to the account.
- Class leaderboard access is disabled by default and requires opt-in. It is limited to opted-in students in the same class and exposes XP/streak only, never todo data.
- **Goals & habits** lets users create goals with milestones and check habits off by day. **Categories** supports user-created labels and completion progress.
- Registration onboarding has three steps for chronotype, daily goal hours/interests, and personal-vs-class setup. The profile values are saved on the user account.
- Students, teachers, and super-admins all have private My Day, Todos, Focus, Goals & habits, Categories, Calendar, Matrix, Reports, and Trash pages; teacher/admin management panels are separate sidebar destinations.
- Phase 4 APIs live under `/api/productivity`; all endpoints require authentication and keep profile, goals, habits, categories, sessions, and streak data scoped to the current user.
- No AI API integrations or calls are included.
# Todo-Manager
