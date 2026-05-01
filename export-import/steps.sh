1. In your Cloud Shell Editor, click File > Upload and select that service-account.json
2. python3 export_data.py
3. gsutil cp *.json gs://mhtt_backup/base_050126_v1/

4. backups at:
https://console.cloud.google.com/storage/browser/mhtt_backup
5. trigger

🛡️ Part 1: The Billing "Kill Switch" (Safety Net)
This setup protects your Mastercard ending in 7627 by automatically unlinking billing if charges hit a specific threshold.

1. Budget Alert & Pub/Sub
Threshold: Created a budget alert in the Google Cloud Billing console for $2.00.

Trigger: Configured the alert to send a message to a Pub/Sub Topic named budget-kill-switch.

2. Cloud Function Deployment
Function Name: budget-kill-switch-function

Region: us-west2

Runtime: Python 3.12+

Logic: Used a script that listens for the Pub/Sub message, checks if the budget has hit 100%, and calls the updateBillingInfo API to remove the billing account from the project.

Entry Point: stop_billing

3. Permissions (IAM)
Crucial Step: Granted the Project Billing Manager role to the Default compute service account (730111746099-compute@developer.gserviceaccount.com).

Result: The function now has the "authority" to pull the plug on billing if the limit is reached.

🗄️ Part 2: Firestore Manual Backup (Spark Plan)
Since the Spark (Free) Plan does not allow the official gcloud firestore export command, we used a custom Python bridge.

1. Environment Setup
Location: Cloud Shell Editor.

Dependencies: Installed firebase-admin via pip.

Authentication: Created and uploaded a service-account.json key from the Firebase Service Accounts tab.

2. Backup Execution
Script: export_data.py

Process: The script streams the players, ratings, and tournaments collections and saves them as local JSON files.

Command: python3 export_data.py

3. Permanent Storage
Bucket: Created the mhtt_backup bucket in us-west2.

Storage Command: Moved files to the cloud using:
gsutil cp *.json gs://mhtt_backup/base_050126_v1/

Result: Your backup is safely visible in the Cloud Storage Browser.

📝 Key Notes for Next Review
Spark Plan Safety: The mhtt-tournament project is inherently safe; it will never charge you.

Kill Switch Integrity: If you ever change your Mastercard or add a new project, ensure the Project Billing Manager role is assigned to the service account of the new project.

Backup Naming: Always use the base_MMDDYY_vX format to keep your version history clear.
