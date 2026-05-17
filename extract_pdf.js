const fs = require('fs');
const pdf = require('pdf-parse');

let dataBuffer = fs.readFileSync('C:/Users/vsuga/Downloads/Links das Aulas e Materiais PDF.pdf');

pdf(dataBuffer).then(function(data) {
    fs.writeFileSync('C:/Users/vsuga/Desktop/Desenvolvimento/webinar-system/pdf_content.txt', data.text);
    console.log('PDF extracted successfully to pdf_content.txt');
}).catch(function(error) {
    console.error('Error extracting PDF:', error);
});
