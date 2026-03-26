import Landing from "@/components/Landing";
import Mainlayout from "@/components/layout/Mainlayout";
import { AuthProvider } from "@/context/AuthContext";
import { LanguageProvider } from "@/context/LanguageContext";

export default function Home() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <Mainlayout>
          <Landing />
        </Mainlayout>
      </LanguageProvider>
    </AuthProvider>
  );
}
