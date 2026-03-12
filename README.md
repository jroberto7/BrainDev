# BrainDev

Um “segundo cérebro” digital **local** (sem servidor) para programadores, criadores de IA e freelancers.

## Seções

- Prompt de IA
- Clientes
- Rendas
- Programas
- Ferramentas
- Projetos
- Ideias
- Senhas de Acesso

## Como usar

- Recomendado: servir via `http://localhost` (ex: extensão **Live Server** no VS Code).
- Você também pode abrir `BrainDev/index.html` direto no navegador, mas alguns recursos de segurança podem ser bloqueados em `file://`.
- Os dados ficam salvos no **LocalStorage** do seu navegador.

## Backup

- Clique em **Exportar** para baixar um `.json`.
- Clique em **Importar** para restaurar um backup.

## Segurança (importante)

- As áreas **Senhas de Acesso** e **Redes sociais** (clientes) salvam dados no **LocalStorage**.
- Isso **não é criptografado**: quem tiver acesso ao seu perfil do navegador pode acessar os dados.
- Para **revelar/copiar senhas**, o BrainDev solicita autenticação:
  - Preferencial: **WebAuthn** (Windows Hello / Face ID / biometria) — funciona em `https` ou `http://localhost`.
  - Fallback: **Senha mestre** (hash PBKDF2) — também depende de contexto seguro.
