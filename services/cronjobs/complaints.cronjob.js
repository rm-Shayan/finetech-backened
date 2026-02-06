import { Complaint } from "../../models/complaint.model.js";
import nodeCron from "node-cron";


export const deleteComplaintCronjob=()=>{
nodeCron.schedule("*/30 * * * *", async () => {
  try {
    // Find complaints marked deleted > 30 days ago
    const oldDeleted = await Complaint.find({
      isDeleted: true,
    });

    if (oldDeleted.length) {
      const idsToDelete = oldDeleted.map(c => c._id.toString());

      // Permanently remove from DB
      await Complaint.deleteMany({ _id: { $in: idsToDelete } });

      console.log(`[CRON] Auto-purged ${idsToDelete.length} complaints`);
    } else {
      console.log(`[CRON] No complaints to purge`);
    }
  } catch (err) {
    console.error("[CRON] Error purging deleted complaints:", err.message);
  }
});

}
