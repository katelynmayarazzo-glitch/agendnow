import { Link } from "react-router-dom";
import { Logo } from "../components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <h1 className="text-2xl font-bold">Página não encontrada</h1>
      <p className="max-w-sm text-zinc-500">Confira se o endereço está correto. Se recebeu este link de um estabelecimento, peça um novo.</p>
      <Link to="/" className="font-semibold text-brand-600 hover:underline">Ir para o início</Link>
    </div>
  );
}
