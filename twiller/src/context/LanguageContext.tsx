"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";

type LanguageCode = "en" | "es" | "hi" | "pt" | "zh" | "fr";

const translations: Record<LanguageCode, Record<string, string>> = {
  en: {
    home: "Home",
    explore: "Explore",
    notifications: "Notifications",
    messages: "Messages",
    bookmarks: "Bookmarks",
    profile: "Profile",
    more: "More",
    post: "Post",
    sign_in_to_x: "Sign in to X",
    create_your_account: "Create your account",
    forgot_password: "Forgot password?",
  },
  es: {
    home: "Inicio",
    explore: "Explorar",
    notifications: "Notificaciones",
    messages: "Mensajes",
    bookmarks: "Guardados",
    profile: "Perfil",
    more: "Más",
    post: "Publicar",
    sign_in_to_x: "Inicia sesión en X",
    create_your_account: "Crea tu cuenta",
    forgot_password: "¿Olvidaste tu contraseña?",
  },
  hi: {
    home: "होम",
    explore: "खोजें",
    notifications: "सूचनाएं",
    messages: "संदेश",
    bookmarks: "बुकमार्क",
    profile: "प्रोफाइल",
    more: "और",
    post: "पोस्ट",
    sign_in_to_x: "X में साइन इन करें",
    create_your_account: "अपना खाता बनाएं",
    forgot_password: "पासवर्ड भूल गए?",
  },
  pt: {
    home: "Início",
    explore: "Explorar",
    notifications: "Notificações",
    messages: "Mensagens",
    bookmarks: "Favoritos",
    profile: "Perfil",
    more: "Mais",
    post: "Publicar",
    sign_in_to_x: "Entrar no X",
    create_your_account: "Crie sua conta",
    forgot_password: "Esqueceu a senha?",
  },
  zh: {
    home: "首页",
    explore: "探索",
    notifications: "通知",
    messages: "消息",
    bookmarks: "书签",
    profile: "个人资料",
    more: "更多",
    post: "发布",
    sign_in_to_x: "登录 X",
    create_your_account: "创建你的账号",
    forgot_password: "忘记密码？",
  },
  fr: {
    home: "Accueil",
    explore: "Explorer",
    notifications: "Notifications",
    messages: "Messages",
    bookmarks: "Signets",
    profile: "Profil",
    more: "Plus",
    post: "Publier",
    sign_in_to_x: "Se connecter a X",
    create_your_account: "Creer votre compte",
    forgot_password: "Mot de passe oublie ?",
  },
};

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [language, setLanguage] = useState<LanguageCode>("en");

  useEffect(() => {
    const nextLanguage = (user?.preferredLanguage as LanguageCode) || "en";
    setLanguage(nextLanguage);
  }, [user?.preferredLanguage]);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: (key: string) => translations[language]?.[key] || translations.en[key] || key,
    }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
};
