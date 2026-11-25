# Firestore rules deploy

After the one-time setup below, a push to `main` that changes `firestore.rules` publishes the rules. No Google login and no 2-step check on later deploys.

You can also run it by hand: [Actions → deploy-firebase-rules → Run workflow](https://github.com/GreatTA1998/sayonara-sales/actions/workflows/deploy-firebase-rules.yml).

If the secret is missing, that job stops with `GitHub secret FIREBASE_SERVICE_ACCOUNT is missing` and does not call Google.

Photos are Vercel Blob, not Firebase Storage. Indexes are not deployed.

## One-time setup

1. [Create a service account](https://console.cloud.google.com/iam-admin/serviceaccounts/create?project=sayonara-sales). Name it `github-rules-deploy`. On the permissions step, grant **Firebase Rules Admin** (`roles/firebaserules.admin`). Finish.
2. Open that account → **Keys** → **Add key** → **Create new key** → **JSON**. The file downloads. [Service accounts list](https://console.cloud.google.com/iam-admin/serviceaccounts?project=sayonara-sales).
3. [New GitHub secret](https://github.com/GreatTA1998/sayonara-sales/settings/secrets/actions/new). Name: `FIREBASE_SERVICE_ACCOUNT`. Value: the entire JSON file. Add secret.

That is the only time Google asks you to sign in.

## Console paste

If the secret is not set yet, open [Firestore rules](https://console.firebase.google.com/project/sayonara-sales/firestore/rules), replace the editor with `firestore.rules` from the repo, and publish.
