import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { useQuery } from "@tanstack/react-query";
import { getPlans } from "../api";
import { useAuthStore } from "../store/auth";

/**
 * Одно напоминание в день о запланированных визитах.
 *
 * Раньше здесь было по уведомлению на каждый визит, и время бралось не из
 * плана, а от «сейчас»: пятая минута, десятая, пятнадцатая и так далее. У
 * агента с четырнадцатью точками это означало напоминание каждые пять минут за
 * рулём — в том числе про магазины, которые он уже объехал, потому что порядок
 * шёл по ответу сервера, а не по маршруту. Хуже того, вся серия пересобиралась
 * заново при каждом обновлении списка, включая отметку «Посещён»: агент
 * отмечал визит и получал те же напоминания с нуля.
 *
 * Кончалось это предсказуемо: человек отключал уведомления приложения целиком —
 * и вместе с ними терял пуши о назначенных доставках.
 *
 * Почему именно одно, а не «за полчаса до визита»: у плана визита есть только
 * дата (Plan.planDate), времени в нём нет. Напомнить «заранее» не о чем —
 * данные этого не знают. Сводка утром говорит ровно то, что известно: сколько
 * точек на сегодня.
 */

/** Час, когда приходит сводка. Начало рабочего дня, до выезда. */
const REMINDER_HOUR = 9;

/**
 * Постоянный идентификатор.
 *
 * Планирование с тем же идентификатором заменяет прежнее уведомление, поэтому
 * повторный запуск эффекта не плодит копии. Прежний код вместо этого вызывал
 * cancelAllScheduledNotificationsAsync — то есть сносил ВСЕ уведомления
 * приложения, включая чужие.
 */
const REMINDER_ID = "visit-summary-reminder";

export function useVisitReminders() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const { data: plans } = useQuery({
    queryKey: ["plans"],
    queryFn: () => getPlans(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  const plannedCount = plans?.filter(p => p.status === "planned").length ?? 0;

  useEffect(() => {
    // Зависимость — число, а не массив: список приходит новым объектом при
    // каждом обновлении запроса, и на массиве эффект перезапускался бы
    // постоянно.
    if (!isAuthenticated) return;

    if (plannedCount === 0) {
      Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => {});
      return;
    }

    const now = new Date();
    const at = new Date(now);
    at.setHours(REMINDER_HOUR, 0, 0, 0);

    // Утро уже прошло — напоминать не о чем: агент и так в работе, а
    // уведомление «сейчас» было бы тем самым звонком под руку, от которого
    // отключают уведомления целиком.
    if (at <= now) {
      Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => {});
      return;
    }

    Notifications.scheduleNotificationAsync({
      identifier: REMINDER_ID,
      content: {
        title: "План на сегодня",
        body: plannedCount === 1
          ? "Запланирован 1 визит"
          : `Запланировано визитов: ${plannedCount}`,
        data: { type: "visit_reminder" },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: at,
      },
    }).catch(() => {});
  }, [isAuthenticated, plannedCount]);
}
