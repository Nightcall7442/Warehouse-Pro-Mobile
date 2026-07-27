import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { useQuery } from "@tanstack/react-query";
import { getPlans } from "../api";
import { useAuthStore } from "../store/auth";
import { Platform } from "react-native";

// Schedule reminders for today's planned visits
export function useVisitReminders() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const { data: plans } = useQuery({
    queryKey: ["plans"],
    queryFn: getPlans,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!plans || plans.length === 0) return;

    // Cancel all existing scheduled notifications
    Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});

    const plannedVisits = plans.filter(p => p.status === "planned");
    const now = new Date();

    plannedVisits.forEach((plan, idx) => {
      // Schedule reminder 30 minutes before (or in 5 min if no specific time)
      const reminderDate = new Date(now.getTime() + (idx + 1) * 5 * 60 * 1000);

      // Only schedule if it's in the future
      if (reminderDate <= now) return;

      Notifications.scheduleNotificationAsync({
        content: {
          title: "Напоминание о визите",
          body: `${plan.shopName ?? "Магазин"} — запланирован визит`,
          data: { type: "visit_reminder", planId: plan.id, shopId: plan.shopId },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: reminderDate,
        },
      }).catch(() => {});
    });
  }, [plans]);
}
