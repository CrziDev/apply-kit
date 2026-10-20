# Apply Kit (Firefox version)

Click the toolbar icon while filling a job application:

- **Links**: GitHub, LinkedIn, portfolio. Click to copy.
- **Text**: bio, "why this role?", phone, etc. Click to copy.
- **Files**: resume, cover letter. Click to attach to the page's upload field.

## Install (temporary, 1 minute)
1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...** and select `manifest.json` inside this folder.
3. Click the puzzle icon in the toolbar and pin **Apply Kit**.

Temporary add-ons are removed when Firefox restarts, so you'd repeat step 2 each time. Your saved data should come back because the add-on has a fixed ID, but keep your original files too.

## Install (permanent)
- **Firefox Developer Edition / Nightly / ESR:** go to `about:config`, set `xpinstall.signatures.required` to `false`, then zip the folder contents (manifest.json at the top level), rename to `.xpi`, and open it in Firefox.
- **Regular Firefox:** the add-on must be signed. Upload the zip at addons.mozilla.org/developers as **"On your own"** (unlisted); it's signed automatically in minutes and you can install the downloaded `.xpi`. The ID `apply-kit@local` may need to be changed to something unique like `apply-kit@yourname.dev` in manifest.json.

## Use
- Hover an item to Edit or delete it. Replace the sample entries with your own.
- **Adding files:** Firefox closes popups when a file picker opens, so the Files tab has an **Add / manage files in a tab** button. Add your resume there once.
- **Attaching:** on the application page, click the form's upload button (then cancel the dialog), open Apply Kit, Files, click your resume. If a site blocks it, hover the file and use Download.
- Everything stays local in your browser.
