import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "@/locales/en.json";
import ur from "@/locales/ur.json";
import ar from "@/locales/ar.json";
import vi from "@/locales/vi.json";
import no from "@/locales/no.json";
import sv from "@/locales/sv.json";
import da from "@/locales/da.json";
import es from "@/locales/es.json";
import pt from "@/locales/pt.json";
import zh from "@/locales/zh.json";
import ms from "@/locales/ms.json";
import id from "@/locales/id.json";

const RTL_LANGUAGES = ["ar", "ur"];

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English", nativeName: "English", dir: "ltr" },
  { code: "es", name: "Spanish", nativeName: "Español", dir: "ltr" },
  { code: "pt", name: "Portuguese", nativeName: "Português", dir: "ltr" },
  { code: "zh", name: "Chinese", nativeName: "中文", dir: "ltr" },
  { code: "no", name: "Norwegian", nativeName: "Norsk", dir: "ltr" },
  { code: "sv", name: "Swedish", nativeName: "Svenska", dir: "ltr" },
  { code: "da", name: "Danish", nativeName: "Dansk", dir: "ltr" },
  { code: "ms", name: "Malay", nativeName: "Bahasa Melayu", dir: "ltr" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia", dir: "ltr" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt", dir: "ltr" },
  { code: "ur", name: "Urdu", nativeName: "اردو", dir: "rtl" },
  { code: "ar", name: "Arabic", nativeName: "العربية", dir: "rtl" },
];

export const REGION_DEFAULT_LANGUAGE: Record<string, string> = {
  NO: "no", SE: "sv", DK: "da",
  MY: "ms", ID: "id", CN: "zh",
  BR: "pt", PT: "pt",
  MX: "es", ES: "es", AR: "es", CL: "es", CO: "es",
};

function updateDocumentDirection(lng: string) {
  const dir = RTL_LANGUAGES.includes(lng) ? "rtl" : "ltr";
  document.documentElement.setAttribute("dir", dir);
  document.documentElement.setAttribute("lang", lng);
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ur: { translation: ur },
      ar: { translation: ar },
      vi: { translation: vi },
      no: { translation: no },
      sv: { translation: sv },
      da: { translation: da },
      es: { translation: es },
      pt: { translation: pt },
      zh: { translation: zh },
      ms: { translation: ms },
      id: { translation: id },
    },
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
  });

updateDocumentDirection(i18n.language || "en");

i18n.on("languageChanged", (lng) => {
  updateDocumentDirection(lng);
});

export default i18n;
