/**
 * Отказ должен выглядеть отказом.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Упавший запрос выглядел на экранах как «данных нет»: список пустой, а под
 * ним утвердительная подпись — «Планов на сегодня нет. Супервайзер ещё не
 * назначил маршрут». Человек в поле делал единственный разумный вывод: работы
 * нет. По типам этого не видно — пустой массив и отсутствующий ответ дают одну
 * и ту же разметку, поэтому проверка здесь.
 */
jest.mock("../store/theme", () => ({
  useThemeColors: () => ({
    bg: { card: "#fff", elevated: "#f0f0f0", input: "#e0e0e0", primary: "#000" },
    text: { primary: "#000", secondary: "#666", muted: "#999", tertiary: "#888" },
    border: { default: "#ddd", subtle: "#eee" },
    brand: { primary: "#3b6fe0", primaryDim: "#e8edf8", primaryLight: "#5b8cf0", ink: "#fff" },
    accent: { primary: "#3b6fe0", success: "#34c473", warning: "#d4973a", danger: "#d45050", info: "#3b6fe0" },
    status: {
      success: "#34c473", warning: "#d4973a", danger: "#d45050", info: "#3b6fe0",
      successDim: "#e8f8f0", warningDim: "#fdf0e0", dangerDim: "#fde8e8", infoDim: "#e8edf8",
    },
  }),
  useThemeStore: () => ({ isDark: false }),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
jest.mock("@expo/vector-icons", () => ({ Feather: "Feather" }));

import React from "react";
import { Text } from "react-native";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryState, ErrorState } from "../components/QueryState";

const idle = { isLoading: false, isError: false, refetch: () => {} };

describe("QueryState", () => {
  it("при отказе показывает отказ, а не пустое состояние", () => {
    render(
      <QueryState
        query={{ ...idle, isError: true, error: new Error("Network Error") }}
        what="планы"
        isEmpty
        empty={<Text>Планов на сегодня нет</Text>}
      >
        <Text>маршрут</Text>
      </QueryState>
    );

    expect(screen.getByText("Не удалось загрузить планы")).toBeTruthy();
    // Главное в этой проверке: утвердительной подписи быть не должно.
    expect(screen.queryByText("Планов на сегодня нет")).toBeNull();
  });

  it("пустой ответ остаётся пустым ответом", () => {
    render(
      <QueryState query={idle} what="планы" isEmpty empty={<Text>Планов на сегодня нет</Text>}>
        <Text>маршрут</Text>
      </QueryState>
    );

    expect(screen.getByText("Планов на сегодня нет")).toBeTruthy();
    expect(screen.queryByText("Не удалось загрузить планы")).toBeNull();
  });

  it("данные показываются, когда они есть", () => {
    render(
      <QueryState query={idle} what="планы" isEmpty={false} empty={<Text>Планов на сегодня нет</Text>}>
        <Text>маршрут</Text>
      </QueryState>
    );

    expect(screen.getByText("маршрут")).toBeTruthy();
  });

  it("«Повторить» действительно повторяет запрос", () => {
    const refetch = jest.fn();
    render(
      <QueryState query={{ ...idle, isError: true, refetch }} what="заказы">
        <Text>список</Text>
      </QueryState>
    );

    // Нажатие по надписи всплывает до самой кнопки — так же, как палец по ней.
    fireEvent.click(screen.getByText("Повторить"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("отказ сервера печатается его словами, а не советом проверить связь", () => {
    // serverRejected ставит api.ts, когда запрос дошёл до обработчика и тот
    // отказал. Совет «проверьте подключение» отправил бы человека искать сеть
    // там, где дело в правах.
    const refused = Object.assign(new Error("Нет доступа к нормам"), { serverRejected: true });
    render(<ErrorState what="нормы" error={refused} onRetry={() => {}} />);

    expect(screen.getByText("Нет доступа к нормам")).toBeTruthy();
    expect(screen.queryByText(/Проверьте подключение/)).toBeNull();
  });

  it("оборванная связь объясняется связью", () => {
    render(<ErrorState what="нормы" error={new Error("Network Error")} onRetry={() => {}} />);

    expect(screen.getByText(/Проверьте подключение/)).toBeTruthy();
  });
});
