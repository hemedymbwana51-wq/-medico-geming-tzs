# MEDICO GEMING TZS

## Kurasa
- `index.html` — website kuu ya wageni.
- `admin.html` — ukurasa tofauti wa Admin.
- `app.js` — programu inayotumia Firebase; orodha ya magemu husasishwa moja kwa moja kupitia Firestore.

## Muhimu kabla ya kuchapisha
Mradi huu bado unahitaji usanidi wa Firebase. `firebase-config.js`, `firestore.rules` na `functions/index.js` zina thamani za mfano (`WEKA_...`). Haziwezi kufanya kazi mpaka ziwekwe taarifa halisi za Firebase project yako na UID ya akaunti yako ya Admin.

1. Tengeneza Firebase project yako.
2. Washa Authentication: Email/Password na Anonymous.
3. Tengeneza Firestore Database na Storage.
4. Weka Firebase web config kwenye `firebase-config.js`.
5. Weka UID ya akaunti yako ya Admin kwenye `ADMIN_UID`, `firestore.rules`, `storage.rules` na `functions/index.js`.
6. Deploy Firestore rules, Storage rules na Cloud Function kwa Firebase CLI.
7. Washa GitHub Pages kwa repository hii.

**Usiweke password ya Admin ndani ya mafaili.** Ingia kwa akaunti ya Email/Password uliyounda ndani ya Firebase Authentication.
