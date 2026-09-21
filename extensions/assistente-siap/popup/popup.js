const status = document.querySelector("#status");
const toggle = document.querySelector("#toggle");

chrome.runtime.sendMessage({ type: "GET_TAB_STATUS" }).then((response) => {
  if (!response?.supported) {
    status.textContent = "Abra uma página do SIAP para usar o assistente.";
    return;
  }
  if (!response.ok) {
    status.textContent = "Atualize a página do SIAP após instalar a extensão.";
    return;
  }
  const names = { exam: "Correção de Provas", diary: "Diário do Professor", content: "Conteúdo", attendance: "Frequência", grades: "Notas", remote: "Acesso Remoto", "pei-list": "PEI · Etapa 2", "pei-edit": "PEI · Edição", unsupported: "Página não reconhecida" };
  if (response.status.page === "exam") {
    document.querySelector("header p").textContent = "Correção de Provas";
    status.textContent = "Abra o painel para conectar o celular e corrigir as provas.";
  } else {
    status.textContent = `${names[response.status.page] || "SIAP"} · ${response.status.pending || 0} pendência(s) no mês visível.`;
  }
  toggle.disabled = false;
  toggle.textContent = response.status.open ? "Mostrar/ocultar painel" : "Abrir painel lateral";
});

toggle.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "TOGGLE_PANEL" });
  window.close();
});
