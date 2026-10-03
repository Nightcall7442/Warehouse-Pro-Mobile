// Warehouse Pro — три состояния запроса: загрузка, отказ, пусто.
import { type ReactNode } from "react";
import { View } from "react-native";
import { Spacing, Radii } from "../theme";
import { Button, EmptyState } from "./ui";
import { ShimmerSkeleton } from "./Animated";
import { isRetryableError } from "../store/offline";
import { errorText } from "../lib/error-text";
import { useT } from "../i18n";

/**
 * Почему это общий кусок, а не ветка в каждом экране.
 *
 * Упавший запрос почти везде выглядел как «данных нет»: список пустой, кольца
 * показывают нули, а подпись под ними утверждает, что работы нет. Человек в
 * поле, открывший приложение вне зоны уверенного приёма, читал «Супервайзер
 * ещё не назначил маршрут» — и никуда не ехал. «Пусто» — это ответ сервера,
 * «отказ» — отсутствие ответа, и экран обязан называть их разными словами.
 *
 * Собрано в одном месте потому, что правка по одному экрану разъезжается:
 * следующий экран напишет «планов нет» заново.
 */

export interface QueryLike {
  isLoading: boolean;
  isError: boolean;
  /** Идёт ли запрос прямо сейчас — чтобы кнопка «Повторить» показывала работу. */
  isFetching?: boolean;
  error?: unknown;
  refetch: () => unknown;
}

export function ErrorState({
  what,
  error,
  description,
  onRetry,
  retrying,
}: {
  /** Что не загрузилось, в винительном падеже: «план», «заказы», «нормы». По-узбекски — в именительном, как есть. */
  what: string;
  error?: unknown;
  /** Чем «пусто» отличалось бы от отказа именно на этом экране. */
  description?: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  // Оборванная связь и отказ сервера требуют разных слов: человеку, которому
  // сервер ответил «нет доступа», совет «проверьте подключение» не поможет —
  // он будет искать сеть там, где дело в правах. isRetryableError различает их
  // по конверту tRPC: он есть только у запроса, который дошёл до обработчика.
  const t = useT();
  //
  // 401 и 403 очередь считает повторяемыми (сессия, подписка — см. offline.ts),
  // но на экране это ответ сервера, а не связь: «проверьте подключение» агенту,
  // открывшему чужой раздел, отправило бы его искать сеть.
  const status = (error as { response?: { status?: number } } | null | undefined)?.response?.status;
  const refused = error != null && (!isRetryableError(error) || status === 401 || status === 403);
  // Слова отказа — через errorText: английский текст сервера на экран не выходит.
  const refusal = refused ? errorText(error) : null;
  const whatUz = what.charAt(0).toUpperCase() + what.slice(1);

  return (
    <View>
      <EmptyState
        icon="alert-circle"
        title={t(`Не удалось загрузить ${what}`, `${whatUz} yuklab bo'lmadi`)}
        description={
          refusal ??
          description ??
          t("Это сбой связи, а не пустой список. Проверьте подключение и попробуйте снова.", "Bu aloqa uzilishi, bo'sh ro'yxat emas. Ulanishni tekshirib, yana urinib ko'ring.")
        }
      />
      <View style={{ paddingHorizontal: Spacing.xl }}>
        <Button onPress={onRetry} loading={retrying} variant="secondary" fullWidth>
          {t("Повторить", "Qayta urinish")}
        </Button>
      </View>
    </View>
  );
}

/**
 * Обёртка на три состояния. `isEmpty`/`empty` необязательны: у списков своё
 * ListEmptyComponent, и подменять его тут нечем.
 */
export function QueryState({
  query,
  what,
  description,
  loading,
  isEmpty,
  empty,
  children,
}: {
  query: QueryLike;
  what: string;
  description?: string;
  loading?: ReactNode;
  isEmpty?: boolean;
  empty?: ReactNode;
  children: ReactNode;
}) {
  if (query.isLoading) {
    return <>{loading ?? <DefaultSkeleton />}</>;
  }
  if (query.isError) {
    return (
      <ErrorState
        what={what}
        error={query.error}
        description={description}
        onRetry={() => { void query.refetch(); }}
        retrying={query.isFetching}
      />
    );
  }
  if (isEmpty && empty) return <>{empty}</>;
  return <>{children}</>;
}

function DefaultSkeleton() {
  return (
    <View style={{ padding: Spacing.base, gap: 10 }}>
      {[1, 2, 3].map(i => <ShimmerSkeleton key={i} height={56} radius={Radii.lg} />)}
    </View>
  );
}
