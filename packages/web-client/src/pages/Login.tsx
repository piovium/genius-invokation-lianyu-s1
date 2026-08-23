import { Login } from "../components/Login";
import { Layout } from "../layouts/Layout";

export default function LoginPage() {
  return (
    <Layout>
      <div class="h-full flex items-center justify-center pb-12">
        <Login />
      </div>
    </Layout>
  );
}
