// test-pdf.ts
import { LegalDocumentRenderer } from "./src/modules/workers/legalPdfRenderer";
import path from "path";

const sampleBailContent = `
IN THE COURT OF PRINCIPAL JUDICIAL COMMISSIONER AT RANCHI
Filing No: ABP-521/2026
Case No: BA-9932/2026

Dilip Singh ......Petitioner
Versus
The State of Jharkhand ......Opp. Party

INDEX
S.No.  Annexures  Particulars  Page No.
1.     Annexure-1  Certified copy of FIR  1-5
2.     Annexure-2  Copy of Co-accused Bail Order  6-8
3.     Annexure-3  Medical Certificates  9

IN THE COURT OF PRINCIPAL JUDICIAL COMMISSIONER AT RANCHI
Sub:- Application for Anticipatory Bail under Section 482 of BNSS, 2023.

In the matter of an application for anticipatory bail filed by Dilip Singh, Age 28, S/o Late Ram Singh, Resident of Sital Pada, Ranchi, Jharkhand.

Most respectfully Sheweth:

1. That the Petitioner is a peaceful, law-abiding citizen of India and has been falsely implicated in the present case by local adversaries due to business rivalry.
2. That the allegations made in the First Information Report (FIR) are completely concocted, malicious, and lack any corroborative evidence.
3. That the Petitioner is a daily wage laborer and the sole breadwinner of his family, and his custodial interrogation is completely unnecessary for the purpose of investigation.

It is therefore prayed that your Honor may graciously be pleased to release the Petitioner on anticipatory bail in connection with Hatia P.S. Case No. 13/2026.

AND/OR

Pass any other order(s) which your Honor deems fit in the interest of justice.

And for this act of kindness, the petitioner shall ever bound to pray.

: AFFIDAVIT :

I, Dilip Singh, aged about 28 years, son of Late Ram Singh, resident of Sital Pada, Ranchi, do hereby solemnly affirm and state on oath as follows:
1. That I am the petitioner in the accompanying application and am well acquainted with the facts of the case.
2. That the statements made in paragraphs 1 to 3 are true to my personal knowledge.

Ranchi, Jharkhand
Date: 04-06-2026

deponent
`;

async function runTest() {
    const outputFilePath = path.join(__dirname, "test_court_ready_output.pdf");
    console.log("🚀 Starting isolated PDF generation test...");
    
    try {
        const renderer = new LegalDocumentRenderer("BAIL_APPLICATION", outputFilePath);
        const resultPath = await renderer.render(sampleBailContent);
        console.log(`\n✅ Success! PDF successfully generated.`);
        console.log(`📍 Location: ${resultPath}`);
    } catch (error) {
        console.error("❌ PDF Generation Failed:", error);
    }
}

runTest();
