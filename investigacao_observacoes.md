# Observações da investigação

- O repositório `fagnerhs/sbar-unimed-cg` foi clonado em `/home/ubuntu/sbar-unimed-cg`.
- Ao acessar `https://sbar-unimed-cg.onrender.com/`, o serviço do Render estava em processo de inicialização, exibindo a tela intermediária de wake-up.
- O código do frontend carrega pacientes via `GET /api/patients` em `DB.fetchPatients()` e renderiza apenas pacientes sem `discharged` na aba de ativos.
- O backend possui endpoint `GET /api/patients` que retorna todos os documentos de `storage.getPatients()`.
- A configuração local de fallback JSON tem `data/patients.json` vazio; se o ambiente publicado estiver sem MongoDB ou apontando para banco/coleção vazia, a lista aparecerá vazia para todos os perfis.

## Causa confirmada na interface publicada

Após autenticar com o usuário administrador fornecido, o painel abriu, mas a área de pacientes permaneceu vazia e apareceu o erro visual: `Cannot read properties of null (reading 'style')`. No código, `renderPatients()` chama `document.getElementById('searchBarContainer').style...`, porém o HTML da aba de pacientes ativos não contém nenhum elemento com `id="searchBarContainer"`. Esse erro interrompe a função antes de renderizar os cartões dos pacientes, afetando todos os perfis que passam pela listagem de ativos.

## Validação local após a correção

A aplicação foi iniciada localmente apontando para o MongoDB Atlas. Após autenticação administrativa, a aba **Ativos** passou a exibir a barra de busca e os cartões de pacientes ativos, confirmando que a exceção causada pelo elemento `searchBarContainer` ausente deixou de interromper `renderPatients()`. A base Atlas contém 9 pacientes, 12 usuários e 26 registros SBAR no momento do diagnóstico.

