import { Login } from "../components/Login";
import { Layout } from "../layouts/Layout";

export default function LoginPage() {
  return (
    <Layout>
      <div class="flex justify-center py-6">
        <Login />
      </div>
    </Layout>
  );
}
