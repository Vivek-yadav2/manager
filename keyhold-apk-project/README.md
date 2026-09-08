KEYHOLD — BUILDING A REAL .APK
================================
This folder is a complete native Android project for the Keyhold
tenant manager app, ready to be compiled into a real, installable
.apk — for free, using GitHub's build servers. You don't need
Android Studio, a Mac, or any local setup.

It works like this: you upload this project to a free GitHub
repository, a robot (GitHub Actions) automatically compiles it using
the real Android SDK, and you download the finished .apk file from
the "Actions" tab a few minutes later.


STEP 1 — CREATE A FREE GITHUB ACCOUNT (skip if you have one)
--------------------------------------------------------------
Go to https://github.com/signup and create a free account.


STEP 2 — CREATE A NEW REPOSITORY
----------------------------------
1. Go to https://github.com/new
2. Name it e.g. "keyhold-app"
3. Keep it "Public" or "Private" (either works)
4. Do NOT check "Add a README" (we already have the files)
5. Click "Create repository"


STEP 3 — UPLOAD THIS PROJECT
-------------------------------
On the new repository's page:
1. Click "uploading an existing file" (or Add file -> Upload files)
2. Drag the ENTIRE contents of this folder into the browser window
   (all files and subfolders: android/, .github/, capacitor.config.json,
   package.json, www/, etc.)
   - Modern browsers let you drag whole folders onto GitHub's upload
     box and it preserves the folder structure.
   - If drag-and-drop of folders doesn't work in your browser, use
     git from a computer instead (see "Alternative" below).
3. Scroll down, click "Commit changes"


STEP 4 — LET THE BUILD RUN
-----------------------------
1. Click the "Actions" tab at the top of your repository
2. You'll see a workflow run called "Build Android APK" already
   running (it starts automatically after your upload)
   - If you don't see one, click "Build Android APK" on the left,
     then "Run workflow" -> "Run workflow"
3. Wait 3–6 minutes for it to finish (green checkmark = done)


STEP 5 — DOWNLOAD THE APK
----------------------------
1. Click on the completed workflow run
2. Scroll down to "Artifacts"
3. Click "keyhold-debug-apk" to download a zip
4. Unzip it — inside is "app-debug.apk"


STEP 6 — INSTALL ON YOUR PHONE
---------------------------------
1. Transfer app-debug.apk to your phone (email/Drive/USB/WhatsApp)
2. Tap the file to install it
3. Android will warn about "unknown sources" the first time — tap
   Settings -> allow installs from that app (Files/Chrome/etc.),
   then go back and tap the APK again
4. Keyhold installs as a normal app icon on your home screen

This is a "debug" build, which Android happily installs on any
phone — it's just not signed for the Play Store. For personal use
it works exactly like a normal installed app, offline, with its own
icon, and no browser involved.


ALTERNATIVE — USING GIT INSTEAD OF DRAG-AND-DROP
---------------------------------------------------
If you have a computer with git installed:

    cd keyhold-apk-project
    git init
    git add .
    git commit -m "Initial commit"
    git branch -M main
    git remote add origin https://github.com/YOUR-USERNAME/keyhold-app.git
    git push -u origin main

Then continue from Step 4 above.


WANT TO CHANGE THE APP AFTERWARDS?
-------------------------------------
All the app's screens/logic live in the www/ folder (index.html,
style.css, app.js) — the same files as the browser version. Edit
those, re-upload/push, and the Actions workflow rebuilds a fresh APK
automatically every time.


NOTES
-----
- App ID: com.keyhold.tenantmanager
- App name: Keyhold
- All tenant/property/payment data is stored locally on the phone
  (nothing is sent to GitHub or anywhere else — GitHub only compiles
  the code, it never sees your data).
