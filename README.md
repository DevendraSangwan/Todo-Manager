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

## Demo seed data

To add sample verified accounts and classrooms to the MongoDB database configured in the root `.env`, set `SEED_DEMO_DATA=true`. Then run:

```sh
cd backend && npm run seed:demo
```

This creates one super-admin, two teachers, three students, and two classes, plus private student todos, study categories, goals, habits, assignments, sample submissions, and class announcements. All accounts are marked email-verified directly in MongoDB; the script does not send verification emails. The operation is idempotent and updates passwords for these demo accounts each time it runs. The accounts are `admin@gmail.com` (`admin123`), `teacher1@gmail.com` and `teacher2@gmail.com` (both `12345678`), and `student1@gmail.com`, `student2@gmail.com`, and `student3@gmail.com` (all `12345678`). These are intentionally simple local-demo credentials; do not use them outside local testing. The script refuses to run when `NODE_ENV=production`; never run demo seed data against a production database. Set `SEED_DEMO_DATA=false` again when you are done seeding. Existing older demo users are not deleted.

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

## Phase 6 — Security, settings, and classroom tools

- Accounts must verify their email before login. The email link opens a confirmation page; the user explicitly confirms there, so mail-link preview scanners do not consume the one-time token. Existing accounts without a verification flag must use **Resend verification email** on the login page after deployment. Password reset and verification links are single-use and expire after one hour and 24 hours, respectively. Configure `SMTP_HOST`, `SMTP_PORT`, optional `SMTP_USER`/`SMTP_PASSWORD`, `SMTP_SECURE`, and `SMTP_FROM` in the root `.env`; set `APP_URL` to the public frontend URL. Registration is unavailable until SMTP host and sender are configured. Previously issued JWT cookies are invalidated by the server-side session requirement, so users must log in again.
- For local development, restart the backend after pulling or changing auth code so the email-verification API route is loaded. From the project root, run `cd backend && npm run dev` in one terminal and `cd frontend && npm run dev` in another; open the Vite URL (normally `http://localhost:5173`). On the login page, choose **Resend verification email**, open the newest email, and click **Verify my email** on the confirmation page. A `404` from `/api/auth/verify-email` usually means the frontend is reaching an old or incorrectly started backend; confirm the backend reports `API listening on port 5000`. A `403` from login means the account is still unverified; request a fresh link and complete the confirmation step. Do not share `.env` contents or email credentials when asking for help.
- Sessions are stored server-side and tied to signed, HTTP-only JWT cookies. Settings shows active sessions and can revoke every other device. In development, authentication limits reset every minute (10 login attempts, or 5 other actions per IP) for easier local testing. Production keeps the 15-minute window.
- Settings supports display name, theme, timezone, in-app/email/browser notification preferences, reminders, AI data permission, and reduced motion. Email reminders are processed by the running backend and require SMTP. Browser reminders run while the workspace is open and require browser permission.
- **Download my data** exports the authenticated user's profile, tasks, task history, goals, habits, categories, productivity records, focus sessions, saved filters, AI actions, notifications, access requests, assignment submissions, and authored classroom content as CSV or PDF. Other students' IDs are omitted from authored assignment exports. Account deletion requires the current password and typing `DELETE`; super-admin accounts cannot be removed through this endpoint.
- Teachers can create assignments for their whole class or selected enrolled students, review submission timestamps and late status, publish class announcements, and see assignment completion, overdue counts, and a seven-day submission trend. Classroom analytics only use assignment and submission records; private personal todos are not queried. Students can only read and submit their own class assignments.
- Keyboard shortcuts are shown with `?`: `g` then `d` opens My Day, `g` then `t` opens tasks, and `g` then `s` opens Settings. Reduced-motion can be enabled in Settings and works with the operating-system preference.
- Run the backend permission/privacy tests with `cd backend && npm test` and verify the frontend with `cd frontend && npm run build`.

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

## Phase 5 — AI study space

- The **AI study space** is available to students, teachers, and super-admins. It includes private-task suggestions, reviewed task breakdowns, task chat, goal plans, speech-to-todo parsing, postponement-based rescheduling ideas, and a weekly productivity report.
- Configure `GEMINI_API_KEY` in the root `.env` file on the backend only. `GEMINI_MODEL` is optional and defaults to `gemini-2.5-flash`. Never add the key to Vite/frontend variables or browser code. If the key is unset, AI endpoints return an explicit unavailable response.
- AI requests are made by the Express backend. Personal task data sent to Gemini is selected only from records owned by the authenticated account; task chat does not use classmates' or teacher-managed task records. Voice capture uses browser speech recognition, then sends the transcript to the backend only after the user requests parsing.
- AI generation endpoints are limited to 30 requests per 15 minutes per client IP.
- AI-generated task changes are drafts. Additions and date/priority changes show an exact preview and require approval unless the user has enabled the matching, revocable **AI Permissions** setting. Applied changes can be undone from the review card; move history records old and new values.
- Breakdowns, generated goal plans, and voice drafts are reviewed before saving. Weekly reports disclose when there is insufficient completed-task data.
- Run verification with `cd backend && npm test` and `cd frontend && npm run build`.
# Todo-Manager
