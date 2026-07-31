import { PrismaClient, CourtTier } from '@prisma/client';

const prisma = new PrismaClient();

// Removed parseTemplateToTipTap since frontend parses it on load

const templatesToSeed = [
  {
    title: 'Non-Disclosure Agreement',
    slug: 'non-disclosure-agreement',
    category: 'Contract',
    courtTier: CourtTier.GENERAL,
    tags: ['NDA', 'Contract', 'Confidentiality'],
    description: 'A standard NDA for protecting confidential information.',
    rawBody: `NON-DISCLOSURE AGREEMENT

## PARTIES
- This Non-Disclosure Agreement ("Agreement") is made on {{agreement_date}} by and between:
- {{disclosing_party_name}}, a company incorporated under the Companies Act, 2013, having its registered office at {{disclosing_party_address}} (hereinafter "Disclosing Party", which expression shall include its successors and permitted assigns);
- AND {{receiving_party_name}}, a company incorporated under the Companies Act, 2013, having its registered office at {{receiving_party_address}} (hereinafter "Receiving Party", which expression shall include its successors and permitted assigns).
- Disclosing Party and Receiving Party are hereinafter referred to individually as a "Party" and collectively as the "Parties".

## RECITALS
- WHEREAS the Parties wish to explore a potential business relationship in relation to {{proposed_transaction_description}} ("Proposed Transaction");
- AND WHEREAS in connection with the Proposed Transaction, the Parties may disclose to each other certain confidential and proprietary information;
- NOW THEREFORE, in consideration of the mutual covenants contained herein, the Parties agree as follows:

## DEFINITION OF CONFIDENTIAL INFORMATION
- "Confidential Information" means all non-public, proprietary or commercially sensitive information disclosed by one Party (the "Disclosing Party") to the other (the "Receiving Party"), whether disclosed orally, in writing, or by inspection of tangible objects, including business plans, financial information, technical data, trade secrets and know-how.

## EXCLUSIONS
- Confidential Information does not include information that: (a) is or becomes publicly available through no fault of the Receiving Party; (b) was already known to the Receiving Party prior to disclosure; (c) is independently developed without use of the Confidential Information; or (d) is disclosed with the Disclosing Party's prior written consent.

## OBLIGATIONS OF RECEIVING PARTY
- The Receiving Party shall hold the Confidential Information in strict confidence and shall not disclose it to any third party without the Disclosing Party's prior written consent, except to employees, advisors or affiliates on a need-to-know basis who are bound by confidentiality obligations no less protective than those herein.

## TERM
- This Agreement shall remain in force for {{confidentiality_term}} from the date first written above, and confidentiality obligations shall survive termination for a further period of {{survival_period}}.

## GOVERNING LAW AND JURISDICTION
- This Agreement is governed by the laws of India, and the courts at {{jurisdiction_city}} shall have exclusive jurisdiction over disputes arising hereunder.

## MISCELLANEOUS
- This Agreement constitutes the entire understanding between the Parties and may only be amended in writing signed by both Parties.

## SIGNATURE AND DATE
- IN WITNESS WHEREOF, the Parties have executed this Agreement on the date first written above.
- For {{disclosing_party_name}}, Signature: {{disclosing_party_signature}}, Name: {{disclosing_party_signatory}}, Designation: {{disclosing_party_designation}}
- For {{receiving_party_name}}, Signature: {{receiving_party_signature}}, Name: {{receiving_party_signatory}}, Designation: {{receiving_party_designation}}`,
  },
  {
    title: 'Employment Agreement',
    slug: 'employment-agreement',
    category: 'Contract',
    courtTier: CourtTier.GENERAL,
    tags: ['Employment', 'HR', 'Contract'],
    description: 'A standard employment contract setting forth terms and conditions.',
    rawBody: `EMPLOYMENT AGREEMENT

## PARTIES
- This Employment Agreement ("Agreement") is entered into on {{agreement_date}}, BY AND BETWEEN:
- {{company_name}}, a company incorporated under the Companies Act, 2013, having its registered office at {{company_address}} (hereinafter "Company" or "Employer", which expression shall include its successors and permitted assigns),
- AND {{employee_name}}, son/daughter/wife of {{employee_parent_name}}, aged {{employee_age}} years, residing at {{employee_address}} (hereinafter "Employee").

## RECITALS
- WHEREAS the parties desire to set forth the terms and conditions of the Employee's employment with the Company;
- NOW THEREFORE, the parties agree as follows:

## POSITION
- The Employee shall be employed as {{employee_designation}} of the Company, and shall report to {{reporting_manager}}.

## TERM AND PROBATION
- The Employee's employment shall commence on {{employment_start_date}}.
- The first {{probation_period}} shall constitute a probationary period, during which either party may terminate this Agreement by giving {{probation_notice_period}} written notice.

## COMPENSATION
- The Employee shall be paid a gross monthly/annual salary of Rs. {{salary_amount}}, payable in accordance with the Company's standard payroll cycle, subject to applicable statutory deductions.

## WORKING HOURS AND LOCATION
- The Employee shall work from {{work_location}} during the Company's standard working hours, subject to reasonable variation as required by business needs.

## DUTIES
- The Employee shall devote their full working time to the Company's business and perform all duties assigned faithfully, diligently, and to the best of their abilities.

## CONFIDENTIALITY
- The Employee shall not, during or after the term of employment, disclose any confidential or proprietary information of the Company to any third party without prior written consent.

## LEAVE
- The Employee shall be entitled to {{annual_leave_days}} days of paid leave per year, in accordance with the Company's leave policy and applicable state Shops & Establishments law.

## TERMINATION
- After the probationary period, this Agreement may be terminated by either party by giving {{termination_notice_period}} written notice, or payment in lieu thereof.
- The Company may terminate the Employee's services without notice for proven misconduct.

## GOVERNING LAW AND JURISDICTION
- This Agreement is governed by the laws of India, and courts at {{jurisdiction_city}} shall have exclusive jurisdiction.

## SIGNATURE AND DATE
- IN WITNESS WHEREOF, the parties have executed this Agreement on the date first written above.
- For {{company_name}}, Signature: {{company_signature}}, Name: {{company_signatory_name}}, Designation: {{company_signatory_designation}}
- Employee Signature: {{employee_signature}}, Name: {{employee_name}}`,
  },
  {
    title: 'Rent / Lease Agreement',
    slug: 'rent-lease-agreement',
    category: 'Contract',
    courtTier: CourtTier.GENERAL,
    tags: ['Rent', 'Lease', 'Real Estate'],
    description: 'A standard rental agreement for residential properties.',
    rawBody: `RENTAL AGREEMENT

## PARTIES
- This Rental Agreement is executed at {{execution_place}} on {{agreement_date}} by and between:
- {{owner_name}}, son/daughter of {{owner_parent_name}}, residing at {{owner_address}} (hereinafter "Owner", which expression shall include heirs, legal representatives, successors and assigns);
- AND {{tenant_name}}, son/daughter of {{tenant_parent_name}}, residing at {{tenant_permanent_address}} (hereinafter "Tenant", which expression shall include legal representatives, successors and assigns).

## RECITALS
- WHEREAS the Owner is the absolute owner of the property situated at {{property_address}} ("Demised Premises"), and the Tenant has requested to take the same on rent for residential purposes;
- NOW THIS AGREEMENT WITNESSETH AS FOLLOWS:

## TERM
- The tenancy shall commence from {{tenancy_start_date}} and remain valid until {{tenancy_end_date}}, extendable by mutual consent.

## RENT
- The Tenant shall pay a monthly rent of Rs. {{monthly_rent}}, excluding electricity and water charges, payable on or before the {{rent_due_day}} of each month.

## SECURITY DEPOSIT
- The Tenant shall pay an interest-free refundable security deposit of Rs. {{security_deposit}}, to be refunded at the time of vacating the premises, subject to deductions for damages if any.

## MAINTENANCE CHARGES
- The Tenant shall pay a monthly maintenance charge of Rs. {{maintenance_charge}} towards upkeep of common areas and facilities.

## USE OF PREMISES
- The Tenant shall use the premises solely for residential purposes and shall not sublet, assign, or part with possession without the Owner's prior written consent.

## REPAIRS
- Minor day-to-day repairs shall be the Tenant's responsibility; structural or major repairs shall be carried out by the Owner.

## TERMINATION
- Either party may terminate this Agreement by giving {{termination_notice_period}} prior written notice.

## JURISDICTION
- Any disputes arising under this Agreement shall be subject to the jurisdiction of the courts at {{jurisdiction_city}}.

## SIGNATURE AND DATE
- IN WITNESS WHEREOF, both parties have signed this Agreement on the date first written above.
- Owner Signature: {{owner_signature}}, Name: {{owner_name}}
- Tenant Signature: {{tenant_signature}}, Name: {{tenant_name}}
- Witnesses: 1. Name: {{witness_1_name}} Signature: {{witness_1_signature}}; 2. Name: {{witness_2_name}} Signature: {{witness_2_signature}}`,
  },
  {
    title: 'Vakalatnama',
    slug: 'vakalatnama',
    category: 'Litigation',
    courtTier: CourtTier.HIGH_COURT,
    tags: ['Vakalatnama', 'Litigation'],
    description: 'A standard Vakalatnama format for authorizing an advocate.',
    rawBody: `VAKALATNAMA

## CAUSE TITLE
- Before the Hon'ble {{court_name}}
- {{case_number}} of {{case_year}}
- Between {{petitioner_name}} ...Petitioner/Applicant/Appellant/Plaintiff
- Vs. {{respondent_name}} ...Respondent/Non-applicant/Defendant

## APPOINTMENT
- I/We {{client_name}} do hereby appoint and retain Advocate {{advocate_name}} (hereinafter "the Advocate") to be my/our advocate in the said Suit/Appeal/Petition/Case/Reference/Revision/Execution. 
- I/We authorize the Advocate to do any or all of the following on my/our behalf:

## AUTHORIZATIONS
- To represent, act and appear for me/us.
- To conduct and prosecute (or defend) the same and all proceedings connected with the same or any decree or order passed therein.
- To sign, file, verify, present and receive all documents including plaints, statements, pleadings, appeals, petitions, applications, or affidavits.
- To withdraw, compromise or submit to arbitration any disputes touching or relating to the said case.
- To deposit, draw and receive money, cheques, cash and grant receipts thereof.
- To do all other acts and things necessary or expedient, in the opinion of the Advocate, to be done.

## RATIFICATION
- I/We do hereby agree to ratify and confirm all acts done by the Advocate or his/her substitute in the matter as my/our own acts.

## SIGNATURE AND DATE
- Signature of Client(s): {{client_signature}}
- Advocate Name: {{advocate_name}}, Enrollment No.: {{advocate_enrollment_no}}, Signature: {{advocate_signature}}
- Date: {{vakalatnama_date}}
- Place: {{vakalatnama_place}}`,
  },
  {
    title: 'Sale Deed',
    slug: 'sale-deed',
    category: 'Property',
    courtTier: CourtTier.GENERAL,
    tags: ['Sale Deed', 'Property', 'Conveyance'],
    description: 'A standard Sale Deed for the transfer of property.',
    rawBody: `SALE DEED

## PARTIES
- This Sale Deed is made and executed at {{execution_place}} on {{execution_date}} by and between:
- {{vendor_name}}, son/daughter of {{vendor_parent_name}}, aged {{vendor_age}}, {{vendor_occupation}}, resident of {{vendor_address}}, holding PAN {{vendor_pan}} and Aadhaar {{vendor_aadhaar}} (hereinafter "Vendor");
- AND {{purchaser_name}}, son/daughter of {{purchaser_parent_name}}, aged {{purchaser_age}}, {{purchaser_occupation}}, resident of {{purchaser_address}}, holding PAN {{purchaser_pan}} and Aadhaar {{purchaser_aadhaar}} (hereinafter "Purchaser").

## RECITALS
- WHEREAS the Vendor is the owner and in possession of the property described in the Schedule below, having acquired title vide registered document No. {{title_document_number}}, registered at the office of the Sub-Registrar, {{sub_registrar_office}};
- AND WHEREAS the Vendor has agreed to sell and the Purchaser has agreed to purchase the said property for a total consideration of Rs. {{sale_consideration}};
- NOW THIS DEED WITNESSETH AS UNDER:

## TRANSFER OF PROPERTY
- In consideration of Rs. {{sale_consideration}}, received in full by the Vendor from the Purchaser prior to execution of this Sale Deed, the Vendor hereby sells, conveys, transfers and assigns the property described in the Schedule below, unto the Purchaser absolutely and forever.
- Actual physical possession of the property has been handed over by the Vendor to the Purchaser upon execution of this Sale Deed.

## EXPENSES AND DUES
- All expenses of this Sale Deed, including stamp duty, execution and registration fees, shall be borne by the Purchaser.
- All taxes, charges and dues relating to the property up to the date of this Sale Deed shall be borne by the Vendor; thereafter by the Purchaser.

## REPRESENTATIONS AND RIGHTS
- The Vendor confirms the property is free from all encumbrances, mortgages, litigation or attachment, and undertakes to indemnify the Purchaser against any defect in title.
- The Purchaser shall have full right to apply for mutation, and water/electricity connections in their own name.

## SCHEDULE OF PROPERTY
- {{property_description}}
- Boundaries: East: {{boundary_east}}, West: {{boundary_west}}, North: {{boundary_north}}, South: {{boundary_south}}

## SIGNATURE AND DATE
- IN WITNESS WHEREOF the parties have signed this Sale Deed on the date first written above, in the presence of the witnesses below.
- Vendor Signature: {{vendor_signature}}, Name: {{vendor_name}}
- Purchaser Signature: {{purchaser_signature}}, Name: {{purchaser_name}}
- Witnesses: 1. Name: {{witness_1_name}} Address: {{witness_1_address}} Signature: {{witness_1_signature}}; 2. Name: {{witness_2_name}} Address: {{witness_2_address}} Signature: {{witness_2_signature}}`,
  },
  {
    title: 'Power of Attorney (General)',
    slug: 'power-of-attorney-general',
    category: 'Property / Corporate',
    courtTier: CourtTier.GENERAL,
    tags: ['Power of Attorney', 'POA', 'Property'],
    description: 'A General Power of Attorney for broad representation.',
    rawBody: `GENERAL POWER OF ATTORNEY

## PARTIES
- This General Power of Attorney is made and executed on {{execution_date}} BETWEEN:
- {{principal_name}}, PAN {{principal_pan}}, Aadhaar {{principal_aadhaar}}, son/daughter/wife of {{principal_parent_name}}, residing at {{principal_address}} (hereinafter "OWNER/PRINCIPAL");
- AND {{attorney_name}}, PAN {{attorney_pan}}, Aadhaar {{attorney_aadhaar}}, son/daughter/wife of {{attorney_parent_name}}, residing at {{attorney_address}} (hereinafter "ATTORNEY").

## RECITALS
- WHEREAS the Principal is entitled to certain properties, movable and immovable, more particularly described in the Schedule hereunder ("Said Properties");
- AND WHEREAS the Principal is unable to manage and look after the Said Properties personally and desires to appoint the Attorney to act on their behalf;
- NOW, THEREFORE, KNOW ALL MEN BY THESE PRESENTS that I, {{principal_name}}, do hereby appoint, nominate and constitute {{attorney_name}} as my true and lawful Attorney to do and execute the following acts on my behalf:

## GRANTED POWERS
- To manage and maintain the Said Properties on my behalf.
- To enter into agreements for sale with prospective buyers, and to receive earnest money and part/full consideration on my behalf.
- To sign, execute and submit applications, deeds, and documents before any Court, Registrar, Sub-Registrar, Municipal Corporation, or other authority in respect of the Said Properties.
- To represent me before Government offices, tribunals and courts in matters relating to the Said Properties.
- To sign and present deeds of sale, conveyance, lease, or mortgage in respect of the Said Properties and to admit execution and receive consideration thereof.
- To appoint advocates and sign pleadings, plaints, and written statements on my behalf in relation to the Said Properties.
- To pay taxes, dues and statutory charges relating to the Said Properties.

## LIMITATIONS AND REVOCATION
- This Power of Attorney is granted without any consideration, and no right, title or interest in the Said Properties is created in favour of the Attorney by virtue hereof. 
- The Attorney shall not have the power to construct or develop the Said Properties unless expressly authorized in writing.
- The Principal reserves the right to revoke this Power of Attorney at any time.

## SCHEDULE OF PROPERTIES
- {{property_description}}

## SIGNATURE AND DATE
- IN WITNESS WHEREOF the Principal has executed this Power of Attorney on the date first written above.
- Signature of the Principal: {{principal_signature}} ({{principal_name}})
- Accepted by me: Signature of the Attorney: {{attorney_signature}} ({{attorney_name}})
- Witnesses: 1. Name: {{witness_1_name}} Signature: {{witness_1_signature}}; 2. Name: {{witness_2_name}} Signature: {{witness_2_signature}}`,
  },
  {
    title: 'Bail Application (Regular Bail)',
    slug: 'bail-application-regular',
    category: 'Litigation',
    courtTier: CourtTier.DISTRICT_COURT,
    tags: ['Bail', 'Criminal', 'Litigation'],
    description: 'Application for Regular Bail under BNSS.',
    rawBody: `BAIL APPLICATION

## CAUSE TITLE
- IN THE COURT OF {{presiding_judge_designation}}, {{court_name}}
- BAIL APPLICATION NO. {{bail_application_number}} OF {{application_year}}
- ARISING OUT OF CRIMINAL CASE NO. {{criminal_case_number}}
- IN THE MATTER OF: {{applicant_name}} ...APPLICANT/ACCUSED
- V/S {{respondent_state_name}} ...RESPONDENT
- P.S.: {{police_station}}, FIR No.: {{fir_number}}, Sections: {{offence_sections}}
- APPLICATION UNDER SECTION 480 OF THE BHARATIYA NAGARIK SURAKSHA SANHITA, 2023 SEEKING REGULAR BAIL

## PRELIMINARY FACTS
- MOST RESPECTFULLY SHOWETH THAT:
- The Applicant is preferring the present application seeking regular bail under Section 480 of the Bharatiya Nagarik Suraksha Sanhita, 2023, in relation to FIR No. {{fir_number}} dated {{fir_date}} registered at {{police_station}} under Sections {{offence_sections}}.
- The Applicant/Accused is a law-abiding citizen and has been falsely implicated in the above-mentioned case.
- The Applicant has been in custody since {{custody_start_date}}.
- The Applicant is a citizen of India, residing at {{applicant_address}}.

## RELEVANT FACTS
- {{case_facts}}

## GROUNDS FOR BAIL
- {{bail_grounds}}

## PRAYER
- In the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:
- Direct the Applicant to be released on bail on such terms and conditions as this Hon'ble Court may deem fit.
- Pass any other order as the Court may deem fit and proper in the interest of justice.
- AND FOR THIS ACT OF KINDNESS, THE APPLICANT SHALL EVER PRAY.

## SIGNATURE AND DATE
- FILED BY: {{advocate_name}}, Advocate for the Applicant
- Address: {{advocate_address}}
- Email: {{advocate_email}}, Mobile: {{advocate_mobile}}
- Date: {{application_date}}
- Place: {{application_place}}`,
  },
  {
    title: 'Bail Application (Anticipatory Bail)',
    slug: 'bail-application-anticipatory',
    category: 'Litigation',
    courtTier: CourtTier.HIGH_COURT,
    tags: ['Bail', 'Anticipatory Bail', 'Criminal', 'Litigation'],
    description: 'Application for Anticipatory Bail under BNSS.',
    rawBody: `ANTICIPATORY BAIL APPLICATION

## CAUSE TITLE
- IN THE COURT OF {{court_name}}
- ANTICIPATORY BAIL APPLICATION NO. {{anticipatory_bail_application_number}} OF {{application_year}}
- {{petitioner_name}}, residing at {{petitioner_address}} ...Petitioner
- V/s {{respondent_state_name}} at the instance of the Inspector of Police In-charge of {{police_station}} ...Respondent
- APPLICATION UNDER SECTION 482 OF THE BHARATIYA NAGARIK SURAKSHA SANHITA, 2023 (SEEKING ANTICIPATORY BAIL)
- To THE HON'BLE {{court_name}} AND ITS COMPANION JUDGES.
- THE HUMBLE PETITION OF THE PETITIONER ABOVENAMED:

## PRELIMINARY FACTS
- MOST RESPECTFULLY SHEWETH:
- The Petitioner is a citizen of India, aged about {{petitioner_age}} years, and a permanent resident of {{petitioner_city}}, residing at the address mentioned in the cause title.
- The Petitioner apprehends arrest in connection with a complaint/FIR bearing {{fir_number}} dated {{fir_date}} registered at {{police_station}} under Sections {{offence_sections}}.

## BACKGROUND OF THE DISPUTE
- {{case_background}}

## GROUNDS FOR APPREHENSION
- The allegations made against the Petitioner are false, frivolous and motivated, for the following reasons: {{grounds_for_apprehension}}.
- The Petitioner is willing to cooperate with the investigation and abide by any terms and conditions this Hon'ble Court may impose.

## PRAYER
- It is most respectfully prayed that this Hon'ble Court may be pleased to:
- Direct that in the event of arrest, the Petitioner be released on bail on such terms and conditions as this Hon'ble Court may deem fit.
- Pass any other order as this Hon'ble Court may deem fit and proper in the interest of justice.
- AND FOR THIS ACT OF KINDNESS, THE PETITIONER SHALL EVER PRAY.

## SIGNATURE AND DATE
- FILED BY: {{advocate_name}}, Advocate for the Petitioner
- Address: {{advocate_address}}
- Date: {{application_date}}
- Place: {{application_place}}`,
  }
];

async function seedTemplates() {
  console.log("🌱 Starting Templates Seeding...");

  for (const t of templatesToSeed) {
    console.log(`Upserting Template: ${t.title}...`);
    
    // Save raw text as bodyContent (a JSON string) since frontend uses parseTemplateToHTML on load
    const bodyContent = t.rawBody;

    await prisma.template.upsert({
      where: { slug: t.slug },
      update: {
        title: t.title,
        category: t.category,
        courtTier: t.courtTier,
        tags: t.tags,
        description: t.description,
        bodyContent: bodyContent, 
      },
      create: {
        title: t.title,
        slug: t.slug,
        category: t.category,
        courtTier: t.courtTier,
        tags: t.tags,
        description: t.description,
        bodyContent: bodyContent,
      }
    });

    console.log(`✅ Seeded: ${t.title}`);
  }

  console.log("🎉 Templates Seeding Complete!");
  process.exit(0);
}

seedTemplates().catch((e) => {
  console.error("Failed to seed templates:", e);
  process.exit(1);
});
