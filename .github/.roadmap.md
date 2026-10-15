# Project: Student Todo App (MERN)
step-1

## Tech stack
- Frontend: React (Vite) + Tailwind CSS + Lucide icons + React Router
- Backend: Node.js + Express
- Database: MongoDB with Mongoose
- Auth: JWT (httpOnly cookie), bcrypt password hashing
- Folder structure: /client and /server

## Roles (RBAC, enforced in backend middleware, not just frontend)
- STUDENT / PERSONAL user
- TEACHER_ADMIN (admin of one class only)
- SUPER_ADMIN (manages classes and teachers)

## Data model rules
- Separate collections: Users, Todos, Classes, Requests/Notifications
- Todo fields: userId, classId (optional), title, description, priority,
  dueDate, status (pending/completed), visibility (private/classmates/public),
  completionNote (optional), createdAt, updatedAt
- Always paginate list APIs (page, limit) and support date-wise filtering.

## Security rules (very important)
- Passwords are always hashed with bcrypt, never returned in any API.
- A user can edit/delete ONLY their own todos.
- Classmates can only READ todos with visibility "classmates" or "public".
- Personal account todos are NEVER visible to a teacher/admin automatically,
  even after joining a class.
- A teacher can edit todos only of students in THEIR class.
- Admin can see user emails but never passwords.
- Validate all inputs (use express-validator or zod), add rate limiting on login.

## Coding rules
- Clean, modular code: routes / controllers / middleware / models.
- Use async/await with proper error handling and meaningful HTTP status codes.
- Use environment variables (.env) for secrets. Provide .env.example.
- UI must be simple, clean and beginner-friendly, responsive, with dark/light mode.
- After each task, explain what files were created/changed and how to run them.

Result:

Register page (email, password, confirm password) aur Login page
Login ke baad Dashboard, jisme 4 tabs hain: Add Todo, All Todos, Pending, Completed
Todo mein title, description, priority, due date; complete mark karte time optional note ka box
Todos date-wise grouped dikhte hain, “Next/Previous” pagination ke saath
Dark/light mode toggle navbar mein
MongoDB mein password hashed dikhe, plain text nahi
Logout karke dobara dashboard URL kholo toh login page pe redirect ho

step-2 
Build Phase 2 on top of the existing project. Do NOT touch AI, calendar or reports.

1. Roles: add role field (STUDENT, TEACHER_ADMIN, SUPER_ADMIN) with RBAC middleware.
2. SUPER_ADMIN can CRUD classes and CRUD teachers (assign a teacher to one class).
3. After registration show a screen: "Personal use" or "Join a class".
   - Personal: go straight to dashboard.
   - Join a class: select a class, send a join request. The student joins only
     after the class's TEACHER_ADMIN approves.
4. Todo visibility field: private / classmates / public, selectable while creating a todo.
5. Class students page: list of classmates with their todos (read-only, only
   "classmates" or "public" todos are returned by the API).
6. Teacher can view and edit todos of students in THEIR class only. Personal-account
   todos must never be visible to a teacher.
7. Teacher sees student emails but never passwords.
8. Friend view: a user enters a friend's email to request access to their todos.
   The friend can allow or reject. After allowing, the requester can only read.
9. Notification page with two separate panels: "Requests" and "Answers",
   plus the ability to send a simple message notification to a classmate or friend.
10. Write backend tests proving a student cannot read or edit another user's
    private todo through the API.


Result:

Registration ke baad “Personal / Class” choice screen
Super Admin ka alag panel (class aur teacher management)
Teacher ka panel: pending join requests (approve/reject) aur class students ki list
Student dashboard mein naya tab “Classmates’ Todos” (sirf dekh sakta hai, edit button nahi)
Todo form mein visibility dropdown
“Friends” page jahan email dalke request bhejte hain
Notification page mein Requests aur Answers ke 2 panels
Postman ya tests se confirm ho ki private todo dusre user ke liye 403 deta hai
Phase 3: Calendar, reports aur priority matrix

Prompt:

Build Phase 3. Do NOT build AI or gamification yet.

1. Calendar page: monthly view, click a date to see, add and update todos of that date.
   Dates having todos show a small dot.
2. Replace High/Medium/Low priority with a 4-quadrant Priority Matrix:
   Urgent+Important, Important not Urgent, Urgent not Important, Neither.
   Add a matrix view page showing todos in the 4 quadrants.
3. Daily report page: for a chosen date show total, completed, pending and
   completion percentage, with a simple chart (Recharts).
4. Sub-tasks (checklist inside a todo) and recurring todos (daily/weekly/monthly).
5. Trash and undo: deleted todos go to Trash, restorable, with a confirmation
   before permanent delete.
6. Task history: record who changed what and when, including the old due date.
7. Smart search and filters: search by title, notes, status, date, priority,
   plus saved filters like "Overdue high-priority".
8. Teacher audit trail: log every edit, delete and status change a teacher makes.

Result:

Navbar mein Calendar, Matrix, Reports aur Trash links
Calendar pe date click karte hi us din ke todos
4 quadrants wala board
Reports page pe percentage aur chart
Todo ke andar checklist, aur “Repeat” option
Delete karne pe todo Trash mein jaaye, wahan se Restore ho
Search bar aur filter buttons (e-commerce jaisa)
Teacher ke liye “Audit Log” page
Phase 4: Productivity features (bina AI ke)

Prompt:

Build Phase 4. No AI API calls yet.

1. Pomodoro/Focus mode: select a todo, 25-min timer, short and long breaks,
   customizable durations. The timer starts only when the user presses Start.
   After the session, the user can log actual time spent.
2. Time tracking: estimated vs actual time per todo.
3. Streak system: if the user completes 80% of daily tasks, the streak increases
   (show "5 Days Streak"). Add XP points per completed task.
4. Optional leaderboard for classmates (opt-in only, personal todos stay private).
5. Task dependencies: Task B is locked until Task A is completed.
6. "My Day" dashboard: today's tasks, overdue tasks, top 3 priorities, progress.
7. Goals and habits: create a goal with milestones, and daily habit tracking.
8. Custom categories (Study, Coding, Health...) with per-category progress.
9. Onboarding after registration (2-3 steps): Morning/Night person, daily
   goal hours, interests. Save these in the user profile.

Result:

Dashboard ka default page “My Day” ban gaya
Focus page par timer, aur session ke baad time log karne ka popup
Streak badge aur XP bar
Locked todos greyed-out dikhte hain
Goals page aur Categories page
Naye user ko registration ke baad 3-step onboarding milti hai
Phase 5: AI features

Prompt:

Build Phase 5: AI features using the Gemini API (key in .env, API called only
from the backend, never from the frontend).

1. AI Suggestions: based on the user's previous and pending todos, suggest today's
   todos. Analyze pending todos before suggesting.
2. "Break into Steps" button on a todo: AI generates 4-5 sub-tasks, and the user
   reviews and approves before they are saved.
3. Chat With My Tasks: the user asks in natural language ("Show tomorrow's pending
   tasks"). AI answers ONLY from the data the logged-in user is authorized to see.
   If the request is unclear, the AI asks clarifying questions first.
4. AI Permissions: before any action (add or move a todo) the AI shows exactly
   what will change, and the user clicks Approve. Add Undo. Add a settings toggle
   for "always allow" limited to predefined actions only, which the user can revoke.
5. Smart Rescheduling: if a todo is postponed 3+ times, AI suggests splitting it,
   shifting it, or changing priority. Keep the old due-date history.
6. Goal-to-Action: the user enters a goal, AI generates weekly milestones and daily
   tasks, and the user reviews before saving.
7. Voice-to-todo with Web Speech API: "Tomorrow 5 PM submit Maths assignment"
   is auto-parsed into title, date and time.
8. Weekly productivity report written by AI. If data is insufficient, say so clearly.

Result:

Dashboard pe “AI Suggestions” card
Todo ke paas “Break into Steps” button
Chat window jahan tum apne tasks ke baare mein pooch sakti ho
Har AI action se pehle approval popup (“Ye task Friday se Saturday pe move hoga”) aur Undo
Settings mein “AI Permissions” section
Mic button se bolkar todo add hota hai
Phase 6: Security, settings aur polish

Prompt:

Build Phase 6: hardening and settings.

1. Auth security: email verification, forgot-password flow, rate limiting,
   active sessions page with "logout from other devices".
2. Settings page: profile edit, theme, notification preferences
   (in-app/email/browser), AI data permissions, timezone.
3. Reminders: configurable reminders before due date, with browser notifications.
4. Export personal data as CSV/PDF, and account deletion with confirmation.
5. Assignments: teacher creates an assignment with a deadline for the whole class
   or selected students, and tracks submission/late status. Add class analytics
   (completion, overdue, weekly trend) that exclude private personal todos.
6. Announcements from teacher to class.
7. Accessibility: keyboard shortcuts, reduced-motion option, screen-reader labels.
8. Add automated tests for permissions and privacy across all APIs.

Result:

Settings page ke saare tabs
Email verify karne ke baad hi login
Teacher ke paas Assignments, Announcements aur Analytics tabs
“Download my data” aur “Delete account” buttons
Phase 7 (optional): Encryption aur offline

Isse sabse end mein rakho. Pehle ye sochna padega ki class admin ko decrypt key kaise milegi. Is phase ka prompt tab banate hain jab Phase 1 se 6 tak kaam kar rahe hon.

Kaam karne ke tips
Har prompt se pehle Copilot ko likho: “First give me the plan and files you’ll change, then implement.”
Ek prompt ke baad project chalao, dekho ki Result list match karti hai ya nahi, aur git commit karo.
Prompt bahut lamba lage toh usse 2 hisson mein baant do (jaise Phase 2 ka pehle 1 se 5, phir 6 se 10).
Error aaye toh poora error message copy-paste karo.

Chaho toh Phase 7 (encryption) ka approach bhi bata sakti hoon, ya kisi phase ko aur chhote prompts mein tod sakti hoon.