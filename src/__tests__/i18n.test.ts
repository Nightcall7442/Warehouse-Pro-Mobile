/**
 * Язык приложения: выбор человека хранится и переживает перезапуск, пара
 * t(ru, uz) отвечает выбранным языком и внутри React, и вне его.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { renderHook, act } from "@testing-library/react";
import { useLangStore, useT, tt, currentLang } from "../i18n";

beforeEach(async () => {
  await AsyncStorage.clear();
  useLangStore.setState({ lang: "ru", chosen: false });
});

describe("язык приложения", () => {
  it("по умолчанию — русский, пара отдаёт русскую строку", () => {
    expect(currentLang()).toBe("ru");
    expect(tt("Заказ", "Buyurtma")).toBe("Заказ");
  });

  it("выбор узбекского переключает пары везде и записывается на телефон", async () => {
    await act(async () => { await useLangStore.getState().setLang("uz"); });
    expect(tt("Заказ", "Buyurtma")).toBe("Buyurtma");
    expect(await AsyncStorage.getItem("app_lang")).toBe("uz");
    const { result } = renderHook(() => useT());
    expect(result.current("Долг", "Qarz")).toBe("Qarz");
  });

  it("после перезапуска читает сохранённый выбор; мусор в хранилище не ломает", async () => {
    await AsyncStorage.setItem("app_lang", "uz");
    await act(async () => { await useLangStore.getState().loadLang(); });
    expect(currentLang()).toBe("uz");
    expect(useLangStore.getState().chosen).toBe(true);

    useLangStore.setState({ lang: "ru", chosen: false });
    await AsyncStorage.setItem("app_lang", "xx");
    await act(async () => { await useLangStore.getState().loadLang(); });
    expect(currentLang()).toBe("ru");
  });

  it("хук перерисовывается при смене языка", async () => {
    const { result } = renderHook(() => useT());
    expect(result.current("Магазин", "Do'kon")).toBe("Магазин");
    await act(async () => { await useLangStore.getState().setLang("uz"); });
    expect(result.current("Магазин", "Do'kon")).toBe("Do'kon");
  });
});
