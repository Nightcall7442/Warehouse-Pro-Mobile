# Warehouse Pro — Стратегический план улучшений

## Текущий статус
- Приложение работает, роли разделены (агент/супервайзер)
- Ценность: дистрибьютеры кайфуют, готовы платить $200/мес
- Слабые места: отчётность, дизайн дашбордов, нет "вау-эффекта"

---

## УРОВЕНЬ 1: Дизайн-революция (Приоритет: КРИТИЧНЫЙ)

### 1.1 Apple-style Dashboard (Web)
**Проблема:** Текущий Dashboard — обычные карточки с числами
**Решение:**
- Glassmorphism-карточки с backdrop-blur
- Анимированные мини-графики прямо в KPI-карточках (sparklines)
- Живые числа с count-up анимацией при загрузке
- Gradient-фоны для каждой KPI-карточки (как Apple Health)
- Пустое состояние с иллюстрацией, а не просто текст

**Пример вдохновения:** Apple Health, Stripe Dashboard, Linear.app

### 1.2 Revenue Chart — Amazon-style
**Проблема:** Recharts выглядит скучно
**Решение:**
- Gradient area chart с glow-эффектом
- Hover tooltip с glassmorphism
- Переключатель периодов с pill-style (как Apple Music)
- Dual-axis: выручка + количество заказов с разными цветами
- Sparkline в каждой KPI-карточке

### 1.3 Agent Performance — Leaderboard
**Проблема:** Таблица с числами
**Решение:**
- Карточки агентов с аватарами и progress rings
- Medal system (золото/серебро/бронза) с анимацией
- Heatmap по дням недели (как GitHub contributions)
- Стрека "Топ-3 агента недели" с анимацией

### 1.4 Dark Mode переработка
**Проблема:** Тёмная тема просто инвертирует цвета
**Решение:**
- Настоящий dark mode с правильными оттенками (как Linear, Vercel)
- Ambient glow effects на интерактивных элементах
- Subtle gradients на карточках
- Border glow при hover

---

## УРОВЕНЬ 2: Отчётность (Приоритет: ВЫСОКИЙ)

### 2.1 Real P&L (Profit & Loss)
**Проблема:** Сейчас считает только транспортные расходы
**Решение:**
- COGS = стоимость товаров (costPrice × количество)
- Gross margin per product
- Operating expenses breakdown (транспорт, зарплаты, аренда)
- Net profit с trend line
- Comparison: этот месяц vs прошлый
- Export в PDF/Excel

### 2.2 Sales Analytics Dashboard
**Новые метрики:**
- Revenue per shop (heatmap по городам)
- Product affinity analysis (что покупают вместе)
- Average order value trend
- Order frequency per shop (retention)
- Seasonal patterns (что покупают в понедельник vs пятницу)
- Agent efficiency: заказы / визиты ratio

### 2.3 Stock Intelligence
**Новые фичи:**
- Stock valuation (стоимость склада = costPrice × currentStock)
- Stock aging analysis (сколько дней товар лежит)
- Reorder point alerts (автоматические уведомления)
- Stock turnover rate
- Dead stock identification (товар без заказов > 30 дней)

### 2.4 Route Analytics (для супервайзера)
**Новые фичи:**
- GPS trail playback (перемотка маршрута агента за день)
- Visit duration analysis (сколько времени в каждом магазине)
- Route efficiency score (км / заказы)
- Geofence alerts (агент вошёл/вышел из магазина)

---

## УРОВЕНЬ 3: AI и Автоматизация (Приоритет: СРЕДНИЙ)

### 3.1 AI-powered Insights
- "Топ-3 магазина с наибольшим долгом — рекомендуем посетить сегодня"
- "Товар X заканчивается — автоматический заказ поставщику"
- "Агент Y пропустил 3 визита подряд — рекомендуем проверить"
- Predictive analytics: прогноз заказов на следующую неделю

### 3.2 Smart Notifications
- Push-уведомления с персонализацией
- "Ваш план на сегодня: 5 визитов, 2 магазина с долгом"
- "Заказ #1234 ожидает обработки > 2 часов"
- "Склад: товар X — осталось 5 кг"

### 3.3 Auto-replenishment
- Автоматические заказы при достижении reorder point
- ML-модель для прогнозирования спроса
- Интеграция с поставщиками

---

## УРОВЕНЬ 4: Мобильное приложение (Приоритет: ВЫСОКИЙ)

### 4.1 Agent App улучшения
- **Offline-first архитектура** — полная работа без интернета
- **Barcode scanning** в заказах (камера → товар → количество)
- **Photo proof** — фото магазина при посещении
- **Digital signature** — подпись владельца магазина на планшете
- **Route optimization** — оптимальный маршрут между магазинами

### 4.2 Supervisor App улучшения
- **Real-time tracking** — WebSocket вместо polling
- **Geofencing** — автоматическое подтверждение визита
- **Agent comparison** — radar chart эффективности
- **Plan drag-and-drop** — перетаскивание планов между датами

### 4.3 Shared улучшения
- **Biometric auth** — Face ID /指纹 для входа
- **Widgets** — iOS/Android widgets с KPI
- **Haptic feedback** — тактильная обратная связь
- **Animated transitions** — shared element transitions между экранами

---

## УРОВЕНЬ 5: Бизнес-фичи (Приоритет: СРЕДНИЙ)

### 5.1 Multi-currency support
- UZS, USD, RUB, KZT — автоматическая конвертация
- Currency display per shop
- Revenue reporting in multiple currencies

### 5.2 Print & Documents
- PDF invoices с логотипом компании
- Waybill (товарно-транспортная накладная)
- TORG-12 (акт о передаче товара)
- Receipt (чек для магазина)

### 5.3 Integration Ecosystem
- 1C:Enterprise — синхронизация с бухгалтерией
- Telegram Bot — уведомления + управление заказами
- WhatsApp Business — отправка заказов клиентам
- Google Maps API — оптимизация маршрутов

### 5.4 Billing & Monetization
- Tiered pricing: Basic ($99), Pro ($249), Enterprise ($499)
- Per-agent pricing: $10/агент/мес
- Usage-based billing: $0.01/заказ
- White-label для крупных клиентов

---

## ПРИОРИТЕТЫ (ROADMAP)

### Q1: Дизайн-революция + Базовая отчётность
1. Apple-style dashboard (web)
2. Real P&L page
3. Stock valuation
4. Mobile: offline-first reorder

### Q2: AI + Route Analytics
1. Predictive analytics
2. GPS trail playback
3. Route optimization
4. Smart notifications

### Q3: Мобильное приложение v2
1. Barcode scanning in orders
2. Photo proof of visits
3. Digital signatures
4. Biometric auth

### Q4: Enterprise Features
1. Multi-currency
2. 1C integration
3. White-label
4. Advanced billing

---

## ТЕХНИЧЕСКИЙ ДОЛГ

### Критичные
- [ ] Перенести фото в cloud storage (base64 → S3)
- [ ] Исправить bug: dashboard "month" = 30 дней
- [ ] Добавить серверный batch import для Excel
- [ ] Mobile card layout для Reports, SupervisorPlans

### Важные
- [ ] WebSocket для real-time tracking
- [ ] Оптимизация запросов (N+1 problem в reports)
- [ ] Error boundary + error tracking (Sentry)
- [ ] Unit tests для критичных путей

---

## ЦЕНООБРАЗОВАНИЕ

| План | Цена | Включено |
|------|------|----------|
| **Starter** | $99/мес | 3 агента, 100 заказов, базовые отчёты |
| **Pro** | $249/мес | 10 агентов, безлимит заказов, AI-инсайты, GPS tracking |
| **Enterprise** | $499/мес | Безлимит всё, white-label, API, приоритетная поддержка |

**Целевая маржа:** 80% (SaaS-модель)
**Break-even:** 5 клиентов на Pro-плане
