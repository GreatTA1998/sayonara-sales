# Firestore rules deploy

A push to `main` that changes `firestore.rules` publishes the rules. No key is stored in GitHub or Vercel. You can also run it by hand: [Actions → deploy-firebase-rules → Run workflow](https://github.com/GreatTA1998/sayonara-sales/actions/workflows/deploy-firebase-rules.yml) (branch `main`).

If Workload Identity is not set up, the job stops with `Workload Identity is not set up` and does not publish rules.

Photos are Vercel Blob. Indexes are not deployed.

## One-time setup

Open [Cloud Shell](https://shell.cloud.google.com/?project=sayonara-sales) and paste this once. Google may ask you to authorize Cloud Shell. That is the only sign-in.

```bash
set -euo pipefail
PROJECT_ID=sayonara-sales
gcloud config set project "$PROJECT_ID"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
POOL=github
PROVIDER=github
SA_ID=github-rules-deploy
SA_EMAIL="${SA_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
REPO=GreatTA1998/sayonara-sales

gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com firebaserules.googleapis.com --project "$PROJECT_ID"

if ! gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_ID" --project "$PROJECT_ID" --display-name "GitHub rules deploy"
fi

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/firebaserules.admin" \
  --quiet

if ! gcloud iam workload-identity-pools describe "$POOL" --project "$PROJECT_ID" --location=global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$POOL" \
    --project "$PROJECT_ID" \
    --location=global \
    --display-name="GitHub"
fi

if ! gcloud iam workload-identity-pools providers describe "$PROVIDER" \
  --project "$PROJECT_ID" --location=global --workload-identity-pool "$POOL" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
    --project "$PROJECT_ID" \
    --location=global \
    --workload-identity-pool "$POOL" \
    --display-name="GitHub" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository=='${REPO}' && assertion.ref=='refs/heads/main'"
fi

gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project "$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${REPO}" \
  --quiet

echo "provider=projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"
echo "service_account=${SA_EMAIL}"
```

The printed provider must be `projects/1046734127142/locations/global/workloadIdentityPools/github/providers/github`. Those names are already in `.github/workflows/deploy-firebase-rules.yml`. Nothing else is set in GitHub.

## Console paste

Until Cloud Shell has been run, open [Firestore rules](https://console.firebase.google.com/project/sayonara-sales/firestore/rules), replace the editor with `firestore.rules` from the repo, and publish.
