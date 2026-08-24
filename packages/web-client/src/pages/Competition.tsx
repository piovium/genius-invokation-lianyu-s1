import { Match, Switch } from "solid-js";
import { Layout } from "../layouts/Layout";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import { errorMessage } from "../api/errors";
import { Login } from "../components/Login";
import { RegistrationBanner } from "../competition/RegistrationBanner";
import { MyMatches } from "../competition/MyMatches";
import Logo from "../components/Logo.svg";

export default function Competition() {
  const auth = useAuth();
  const { t } = useI18n();

  return (
    <Layout pageScroll>
      <div class="container mx-auto h-full px-2">
        <Switch>
          <Match when={auth.loading()}>
            <div class="text-gray-5">{t("loadingNow")}</div>
          </Match>
          <Match when={auth.error()}>
            <div class="text-red-5">
              {t("userInfoLoadFailed", {
                message: errorMessage(auth.error()),
              })}
            </div>
          </Match>
          <Match when={auth.status().type !== "notLogin"}>
            <RegistrationBanner />
            <img src={Logo} class="h-12 mx-auto my-3" />
            <MyMatches />
          </Match>
          <Match when={true}>
            <div class="h-full flex items-center justify-center">
              <Login />
            </div>
          </Match>
        </Switch>
      </div>
    </Layout>
  );
}
