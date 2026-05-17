import { useState, useEffect } from "react";

const LANG_KEY = "postlap_lang";

export type AppLang = "ar" | "en";

function detectInitialLang(): AppLang {
  const stored = localStorage.getItem(LANG_KEY);
  if (stored === "ar" || stored === "en") return stored;
  const nav = navigator.language || "";
  const detected: AppLang = /^ar/i.test(nav) ? "ar" : "en";
  localStorage.setItem(LANG_KEY, detected);
  return detected;
}

export function useLanguage() {
  const [lang, setLangState] = useState<AppLang>("ar");

  useEffect(() => {
    const detected = detectInitialLang();
    setLangState(detected);
  }, []);

  function setLang(l: AppLang) {
    localStorage.setItem(LANG_KEY, l);
    setLangState(l);
  }

  return { lang, setLang };
}
