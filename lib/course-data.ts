export interface CourseLesson {
  id: string;
  title: string;
  videoUrl: string;
}

export interface CourseModule {
  id: string;
  title: string;
  lessons: CourseLesson[];
}

export interface Course {
  id: string;
  title: string;
  modules: CourseModule[];
}

export const coursesData: Course[] = [
  {
    id: "a-arte-da-cobertura",
    title: "A Arte da Cobertura",
    modules: [
      {
        id: "modulo-principal",
        title: "Aulas",
        lessons: [
          { id: "01", title: "Aula Introdução - A Arte da Cobertura de Tatuagem", videoUrl: "https://youtu.be/ueFk-nf4WV8" },
          { id: "02", title: "Aula Introdução - A Arte da Cobertura de Tatuagem 2", videoUrl: "https://youtu.be/UV6XPXu0usI" },
          { id: "03", title: "Aula Apresentação dos Materiais e Ferramentas de Trabalho", videoUrl: "https://youtu.be/TGhu09f8nS0" },
          { id: "04", title: "Aula Anatomia da Pele como Ela Reage ao Procedimento", videoUrl: "https://youtu.be/8-X3h1QTg-8" },
          { id: "05", title: "Aula Avaliação de Tatuagem Antiga e seu Problemas", videoUrl: "https://youtu.be/sFpweVDEWbQ" },
          { id: "06", title: "Aula Escolha do Desenho Certo para a Cobertura", videoUrl: "https://youtu.be/1qMES6Ib8aA" },
          { id: "07", title: "Aula Técnicas Básicas de Cobertura de Tatuagem", videoUrl: "https://youtu.be/ypbOX11-q8M" },
          { id: "08", title: "Aula Erros comuns e Como Evitar", videoUrl: "https://youtu.be/U8VOZ9jScmU" },
          { id: "9.1", title: "Aula Prática Escolha da Arte e Decalque", videoUrl: "https://youtu.be/BTKwlIGfZ-Q" },
          { id: "9.2", title: "Aula prática Montagem da Bancada", videoUrl: "https://youtu.be/u7JDn2LtWHs" },
          { id: "9.3", title: "Aula Prática Arte na Pele", videoUrl: "https://youtu.be/oAgCerXddRQ" },
          { id: "9.4", title: "Aula Prática Arte na Pele 2", videoUrl: "https://youtu.be/fiumDFrMF94" },
          { id: "9.5", title: "Aula Prática Arte na Pele 3", videoUrl: "https://youtu.be/f2kmk71b1mI" },
          { id: "9.6", title: "Aula Prática Arte na Pele 4", videoUrl: "https://youtu.be/QpWK6X-aWIA" },
          { id: "9.7", title: "Aula Prática Arte na Pele Neutralização", videoUrl: "https://youtu.be/ujjb_kWSu7o" },
          { id: "9.8", title: "Aula Prática Arte na Pele 5", videoUrl: "https://youtu.be/7-AZw6faIDM" },
          { id: "10", title: "Aula Cuidado Pré e Pós Tatuagem", videoUrl: "https://youtu.be/_NxOxiO-MOM" },
          { id: "11", title: "Aula Criando seu Portfólio", videoUrl: "https://youtu.be/uSDo82pMS8I" },
          { id: "12", title: "Encerramento Curso a Arte da Cobertura", videoUrl: "https://youtu.be/COoutSoht5o" },
        ]
      },
      {
        id: "bonus",
        title: "Bônus",
        lessons: [
          { id: "b1", title: "Bônus 01 - Aula Técnica de sombreamento", videoUrl: "https://youtu.be/a_f1qaNwQ_4" },
          { id: "b2-5", title: "Link dos Restantes dos Bônus 2, 3, 4, 5 em Formato PDF", videoUrl: "https://drive.google.com/drive/folders/1rMk-MlOMnL9DNtFNRp92AJs6tJ90NHw1?usp=drive_link" },
          { id: "b6", title: "06 Bônus Extra Aula Prática da Técnica Correção Imediata", videoUrl: "https://youtu.be/9I-XFlIgdLM" }
        ]
      }
    ]
  },
  {
    id: "codigo-da-pele",
    title: "Código da Pele",
    modules: [
      {
        id: "modulo-principal",
        title: "Aulas",
        lessons: [
          { id: "01", title: "Aula - Introdução A Colorimetria", videoUrl: "https://youtu.be/9TE8R-Y_kfI" },
          { id: "02", title: "Aula - Círculo Cromático", videoUrl: "https://youtu.be/PSnaw2YcEMU" },
          { id: "03", title: "Aula - Lendo o Circulo Cromático", videoUrl: "https://youtu.be/loGIJfXQwDo" },
          { id: "04", title: "Aula - Estrela de Oswald", videoUrl: "https://youtu.be/4fiw0RCux3Y" },
          { id: "05", title: "Aula - Fótotipos de Pele", videoUrl: "https://youtu.be/rXQaECDCigM" },
          { id: "06", title: "Aula - Degradação de Pigmento Antigo", videoUrl: "https://youtu.be/AkchQzY8aXY" },
          { id: "07", title: "Aula - Olhar Clinico", videoUrl: "https://youtu.be/upTyn-HrTGw" },
          { id: "08", title: "Aula - Colorimetria Simulação Prática", videoUrl: "https://youtu.be/fzvFv9iiyHM" },
          { id: "09", title: "Aula - Neutralização Colorimetria Aplicada", videoUrl: "https://youtu.be/rpeBDjkAqvU" },
          { id: "10", title: "Aula - Neutralização Colorimetria Aplicada 2", videoUrl: "https://youtu.be/TgQGHuXANTE" },
          { id: "11", title: "Aula - Neutralização Colorimetria Aplicada 3", videoUrl: "https://youtu.be/yf2_lDbFqF8" },
          { id: "12", title: "Aula - Neutralização Colorimetria Aplicada 4", videoUrl: "https://youtu.be/WAlyJzAvueI" },
          { id: "13", title: "Aula - Neutralização Colorimetria Aplicada 5", videoUrl: "https://youtu.be/KNRLGZcwBjQ" },
          { id: "14", title: "Aula - Cobertura Realismo Color", videoUrl: "https://youtu.be/MblN3PQjk4g" },
          { id: "15", title: "Aula - Cobertura Realismo Color 2", videoUrl: "https://youtu.be/plwA9ScV450" },
          { id: "16", title: "Aula - Cobertura Realismo Color 3", videoUrl: "https://youtu.be/nAz5VZoeT90" },
          { id: "17", title: "Aula - Cobertura Realismo Color 4", videoUrl: "https://youtu.be/ksb22X5cNLw" },
          { id: "18", title: "Aula - Cobertura Realismo Color 5", videoUrl: "https://youtu.be/yS8df3ktEfM" },
          { id: "19", title: "Aula - Realismo Colorido", videoUrl: "https://youtu.be/m8BOm1-JeLQ" },
          { id: "20", title: "Aula - Realismo Colorido 2", videoUrl: "https://youtu.be/qJBs3Jp3tVw" },
          { id: "21", title: "Aula - Realismo Colorido 3", videoUrl: "https://youtu.be/f5HCpug9d6I" },
          { id: "22", title: "Aula - Realismo Colorido 4", videoUrl: "https://youtu.be/2zh9zRK4es4" },
          { id: "23", title: "Aula - Cobertura Realismo Preto e Cinza", videoUrl: "https://youtu.be/kdHMZGULiBw" },
          { id: "24", title: "Aula - Cobertura Realismo Preto e Cinza 2", videoUrl: "https://youtu.be/eZHbEwiYOqY" },
          { id: "25", title: "Aula - Cobertura Realismo Preto e Cinza 3", videoUrl: "https://youtu.be/SEqOq9B0_S0" },
        ]
      },
      {
        id: "bonus",
        title: "Bônus",
        lessons: [
          { id: "b1", title: "Link dos Bônus Curso - Código da Pele", videoUrl: "https://drive.google.com/drive/folders/1QmmYiL7t0TPEYNxO2Bax2GqUNgHvuTsR?usp=drive_link" },
          { id: "b2", title: "Live WorkShop Lançamento Código da Pele", videoUrl: "https://youtu.be/F5qBZLFB3F0" },
          { id: "b3", title: "Bônus WorkShop Código da Pele", videoUrl: "https://drive.google.com/drive/folders/1HaL4_td_RPC8DlwgqnYCoEF6B-Q5KeBS?usp=drive_link" },
          { id: "b4", title: "Aula de Boas Vindas WorkShop Código da Pele", videoUrl: "https://youtube.com/shorts/V9w5J3UAbuI" },
          { id: "b5", title: "Mentoria 10 Primeiros a Comprar o Curso CDP", videoUrl: "https://youtu.be/0-0crHl3otE" }
        ]
      },
      {
        id: "order-bumps",
        title: "Order Bumps",
        lessons: [
          { id: "ob1", title: "01 Aula Decalque com IA", videoUrl: "https://youtu.be/Ay5q5AuxHG4" },
          { id: "ob2", title: "02 Tutorial Ficha de Anamnese Para Tatuadores", videoUrl: "https://youtu.be/Z0-9dBmLnAw" },
          { id: "ob2.1", title: "02 Link Formulário Anamnese Para Tatuadores", videoUrl: "https://docs.google.com/forms/d/1dFAG8Qhu0j0WMEUuAB9xEkLGuzEcCPI_Wu394bPCXdw/edit" },
          { id: "ob3", title: "03 Video Aula Fotografia que Vende", videoUrl: "https://youtu.be/LIrhQGPp6aE" },
          { id: "ob3.1", title: "03 Link Guia Fotografica que Vende", videoUrl: "https://drive.google.com/file/d/1BP2Nkm1Fr-EbJbm5sW58i7sRMtOWONCL/view?usp=drive_link" },
          { id: "ob4", title: "04 Link Guia Colorimetria para Tatuadores", videoUrl: "https://drive.google.com/file/d/1qiCpy9rZ96ZWaYYc0MnTXQsZgUzE9Tom/view?usp=drive_link" },
          { id: "ob5", title: "05 Link Guia Captação de Clientes", videoUrl: "https://drive.google.com/file/d/1tEk3aJy77O3Isrq5NSqI05jqZ3AaXpF-/view?usp=drive_link" }
        ]
      }
    ]
  }
];
