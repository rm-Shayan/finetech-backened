import nodeCron from "node-cron";
import { User } from "../../models/user.model.js";
import { Complaint } from "../../models/complaint.model.js";
import {Remark} from "../../models/remarks.model.js"

export const deleteUserCron = () => {
  // ⏰ Runs every 5 minutes to safely catch missed users
  nodeCron.schedule("*/5 * * * *", async () => {
    try {
      console.log("⏰ Delete User Cron Running");

      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

      const usersToDelete = await User.find({
        isDeleted: true,
        updatedAt: { $lte: thirtyMinutesAgo },
      }).select("_id");

      if (!usersToDelete.length) {
        console.log("⏳ No users to delete at this time.");
        return;
      }

      const userIds = usersToDelete.map(u => u._id);

      await Complaint.deleteMany({ userId: { $in: userIds } });
      await Remark.deleteMany({ actionBy:{$in:userIds}})
      await User.deleteMany({ _id: { $in: userIds } });

      console.log(`✅ Deleted ${userIds.length} users`);
    } catch (error) {
      console.error("❌ Delete User Cron Error:", error);
    }
  });
};
