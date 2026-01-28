# splity

<p align="center">
  <a href="https://will-zy.github.io/splity/">
    <img src="https://img.shields.io/badge/launch-tool-blue?style=flat-square" alt="launch">
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/security-pdf_local_only-green?style=flat-square" alt="security">
  <img src="https://img.shields.io/badge/runtime-100%25_browser-orange?style=flat-square" alt="runtime">
  <img src="https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square" alt="license">
</p>

<p align="center">
  <a href="README.md">português</a> • 
  <a href="README.en.md">english</a> • 
  <a href="README.es.md">español</a> •
  <a href="README.de.md">deutsch</a>
</p>

### o que é?
o **`splity`** é uma ferramenta para desmembrar PDFs com base em rótulos dinâmicos (ex: nomes, matrículas, IDs), com processamento **100% no navegador**.

### como usar
1. abra a ferramenta: [splity](https://will-zy.github.io/splity/)
2. carregue o pdf (arraste/solte ou selecione).
3. defina o padrão do rótulo e visualize a prévia.
4. selecione os grupos e exporte:
   - **pdfs separados**
   - **zip**
   - **csv** (índice/relatório)

---

### limitações conhecidas
- pdfs muito grandes podem consumir bastante memória do navegador.
- documentos protegidos por senha/restrições podem falhar dependendo do arquivo.
- se o “rótulo” aparece múltiplas vezes na mesma página, a separação pode exigir um rótulo mais específico.

---

### privacidade
- **não existe backend**: o github pages só hospeda arquivos estáticos (html/css/js).
- **o pdf fica local**: leitura via file api e processamento em memória no seu dispositivo.
- **configurações podem ser salvas no `localStorage`** (apenas preferências da interface; não armazena o pdf).

> nota: a página pode fazer requisições apenas para carregar os próprios arquivos estáticos (e, se houver cdn habilitada no build atual, para carregar bibliotecas). em nenhum caso o **conteúdo do pdf** é enviado.

---

### como auditar (devtools → network)
1. abra o app e pressione **f12** (devtools).
2. vá em **network** e marque “preserve log”.
3. carregue um pdf e faça uma exportação.
4. verifique:
   - não existem requisições **POST/PUT**.
   - não há upload de arquivos.
   - apenas downloads de assets do app (js/css/worker/etc).

---

### desenvolvimento (rodar local)
```bash
git clone https://github.com/will-zy/splity.git
cd splity

# sirva a pasta (recomendado por causa de workers/modules)
python -m http.server 8000
# depois abra: http://localhost:8000
```

---

### licença
distribuído sob a licença MIT. veja [LICENSE](https://github.com/will-zy/splity/blob/main/LICENSE_MIT) para mais informações.
