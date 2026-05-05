export default function SlidePreview({ small = false }: { small?: boolean }) {
  return (
    <div className="relative h-full w-full rounded-2xl bg-[hsl(var(--slide-bg))] p-10 shadow-2xl ring-1 ring-white/5">
      <div className="absolute right-5 top-5 flex gap-1.5">
        <span className="h-2 w-2 rounded-full bg-zinc-500" />
        <span className="h-2 w-2 rounded-full bg-zinc-500" />
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
      </div>
      <h1 className="font-mono text-3xl text-zinc-100">
        Teste <span className="text-zinc-300">de</span>{" "}
        <span className="bg-gradient-to-r from-fuchsia-400 to-pink-300 bg-clip-text text-transparent">Aceitação</span>
      </h1>
      <div className="mt-10 grid grid-cols-3 gap-10 font-mono text-[13px] leading-relaxed text-zinc-400">
        <div>
          <h3 className="mb-2 text-[hsl(var(--rec))]">Função</h3>
          <p>O Teste de Aceitação é realizado para validar se o software atende aos requisitos do cliente e às expectativas do usuário final.</p>
        </div>
        <div>
          <h3 className="mb-2 text-emerald-400">Aceitação</h3>
          <p>Geralmente, é realizado por profissionais de QA em colaboração com stakeholders e usuários finais.</p>
        </div>
        <div>
          <h3 className="mb-2 text-fuchsia-400">Objetivo</h3>
          <p>O objetivo é garantir que o software esteja em conformidade com os critérios de aceitação e que seja satisfatório para os usuários finais.</p>
        </div>
      </div>
    </div>
  );
}
