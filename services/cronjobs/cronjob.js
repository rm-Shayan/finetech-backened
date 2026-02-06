import {deleteUserCron} from "./deleteUser.cronjob.js"
import { deleteComplaintCronjob } from "./complaints.cronjob.js";
/**
 * 🔥 CENTRAL CRON STARTER
 */
export const CentralizeCronJobs = () => {
  deleteUserCron();
  deleteComplaintCronjob();
};
