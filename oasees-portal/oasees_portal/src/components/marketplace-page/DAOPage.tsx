import { Card, Center, Image, Button, Stack, LoadingOverlay, Loader, Text, Flex, Grid, Container, Group, Pill, Modal, UnstyledButton, FileInput, TextInput } from "@mantine/core";
import { useState } from "react";
import React from "react";
import axios from "axios";
import Markdown from "react-markdown";
import remarkGfm from 'remark-gfm'
import styles from './ItemPage.module.css'
import { ethers } from "ethers";
import { NftItem } from "src/types/interfaces";


interface DaoPageProps {
    json: any;
    changePage: (n: number) => void;
    currentDao: any;
    daoHandlers: any;
}


const block_explorer_api = `http://${process.env.REACT_APP_BLOCKCHAIN_HOST}:8082/api/v2/`


const get_abi = async (contract_address: string) => {

    try {
        const request = await axios.get(`${block_explorer_api}/smart-contracts/${contract_address}`);
        const abi = request.data.abi;

        return abi;
    } catch (error) {
        console.error('Error loading ABI: ', error);
        return null;
    }
}


const ipfs_get = async (ipfs_hash: string) => {
    const response = await axios.post(`http://localhost:5001/api/v0/cat?arg=` + ipfs_hash);
    return response;
}


const DAOPage = ({ json, changePage, currentDao, daoHandlers }: DaoPageProps) => {

    const [loading, setLoading] = useState(false);
    const [showJoinComplete, setShowJoinComplete] = useState(false);
    const [showJoinFailed, setShowJoinFailed] = useState(false);

    // VC Join Flow State
    const [showJoinWithVC, setShowJoinWithVC] = useState(false);
    const [vcFileContent, setVcFileContent] = useState("");
    const [vcSignature, setVcSignature] = useState("");
    const [vcGovernanceContract, setVcGovernanceContract] = useState<ethers.Contract | null>(null);

    // const Dao_tags = currentDao.tags?.map((tag,index)=>(
    //     <Pill bg="lightblue" key={index}>{tag}</Pill>
    // ))


    console.log("Governance: ", currentDao.governance);
    console.log("VC Verifier: ", currentDao.vcVerifier);

    const truncate_middle = (str: string) => {
        if (str.length > 35) {
            return str.substring(0, 6) + '...' + str.substring(str.length - 4, str.length);
        }
        return str;
    }


    const join_dao = async (currentDao: any) => {

        setLoading(true);
        try {
            // const dao_content_hash = await json.nft.tokenURI(id);
            // const content = (await ipfs_get(dao_content_hash)).data;
            const signer = await json.provider.getSigner();

            // const dao_token_provider_contract = new ethers.Contract(
            //     content.token_provider_address, 
            //     content.token_provider_abi,
            //     await signer)


            // const vote_token_contract = new ethers.Contract(
            //     content.token_address,
            //     content.token_abi,
            //     await signer)

            const transaction_count = await json.provider.getTransactionCount(json.account);

            const governance_abi = await get_abi(currentDao.governance);
            const governance_contract = new ethers.Contract(
                currentDao.governance,
                governance_abi,
                signer
            )

            // const get_tokens_transaction = await dao_token_provider_contract.getTokens({nonce:transaction_count});
            // const delegate_transaction = await vote_token_contract.delegate(json.account,{nonce:transaction_count+1});
            // const join_transaction = await json.marketplace.joinDao(currentDao.id,{nonce:transaction_count});

            try {
                await governance_contract.vcVerifier();
                console.log("flow 1 - VC required");
                setVcGovernanceContract(governance_contract);
                setShowJoinWithVC(true);
                setLoading(false);
                return; // Stop here, wait for modal submission
            } catch (error) {
                console.log("flow 2 - Standard join");
                const transaction_count = await json.provider.getTransactionCount(json.account);
                await json.marketplace.joinDao(currentDao.id, { nonce: transaction_count });
            }


            setShowJoinComplete(true);

            // await Promise.all([get_tokens_transaction.wait(),join_transaction.wait(),delegate_transaction.wait()]);
        } catch (error) {
            console.error("Metamask error", error);
            setShowJoinFailed(true);
        }
        setLoading(false);
    }

    const submit_vc_join = async () => {
        if (!vcGovernanceContract || !vcFileContent || !vcSignature) return;

        setShowJoinWithVC(false);
        setLoading(true);

        try {
            const payload = JSON.parse(vcFileContent);
            // Fallback to extraction if 'message' is present (EIP-712 structure), else use root
            const vcData = payload.message || payload;

            const check = await vcGovernanceContract.isVerified(json.account);
            console.log(check);

            if (!check) {
                const tx = await vcGovernanceContract.joinDAO(vcData, vcSignature);
                await tx.wait();
            }
            const transaction_count = await json.provider.getTransactionCount(json.account);
            await json.marketplace.joinDao(currentDao.id, { nonce: transaction_count });

            setShowJoinComplete(true);
        } catch (error) {
            console.error("VC Join error", error);
            setShowJoinFailed(true);
        }
        setLoading(false);
    }


    return (
        <>
            <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{ radius: "lg", blur: 7 }} pos="fixed" loaderProps={{
                children: <Stack align='center'>
                    <Loader color='blue' />
                    <h3>Just a moment...</h3>
                    <Text>Your transaction is being processed on the blockchain.</Text>
                </Stack>
            }} />

            <Modal
                opened={showJoinComplete}
                onClose={() => { daoHandlers.increment(); setShowJoinComplete(false); changePage(0); }}
                centered={true}
                size="sm"
            >
                <Stack align="center" gap="xl" my={30}>
                    <Image src="./images/checkmark.png" h={64} w={64}></Image>
                    <Text fw={500} ta="center" mt={10}>DAO joined successfully.</Text>
                </Stack>
            </Modal>

            <Modal
                opened={showJoinWithVC}
                onClose={() => setShowJoinWithVC(false)}
                centered
                title="Join DAO with Verifiable Credential"
            >
                <Stack gap="md" my="md">
                    <Text size="sm" c="dimmed">
                        This DAO requires a Verifiable Credential to join. Please upload your signed VC JSON and signature.
                    </Text>

                    <FileInput
                        label="Credential JSON File"
                        placeholder="Upload vc.json"
                        accept="application/json"
                        onChange={(file: File | null) => {
                            if (file) {
                                const reader = new FileReader();
                                reader.onload = (e: ProgressEvent<FileReader>) => {
                                    setVcFileContent(e.target?.result as string);
                                };
                                reader.readAsText(file);
                            } else {
                                setVcFileContent("");
                            }
                        }}
                    />

                    <TextInput
                        label="Signature"
                        placeholder="0x..."
                        value={vcSignature}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setVcSignature(e.currentTarget.value)}
                    />

                    <Button mt="md" fullWidth color="orange" onClick={submit_vc_join}>
                        Verify & Join
                    </Button>
                </Stack>
            </Modal>

            <Modal
                opened={showJoinFailed}
                onClose={() => { setShowJoinFailed(false); }}
                centered={true}
                size="sm"
            >
                <Stack align="center" gap="xl" my={30}>
                    <Image src="./images/cross.png" h={64} w={64}></Image>
                    <Text fw={500} ta="center" mt={10}>An error occured while joining the DAO.</Text>
                </Stack>
            </Modal>


            <Container maw="95%" w="95%">
                <Flex justify="start" mt={30}>
                    <UnstyledButton onClick={() => changePage(0)}><Text c="#0000FF"><u>⬅ Back to the Marketplace</u></Text></UnstyledButton>
                </Flex>


                <h2>{currentDao.title}</h2>
                <Group gap="xs">
                    <Image src="./images/oasees-logo2.png" w={16} h={16} />
                    <Text fz={14}>OASEES Network</Text>
                </Group>

                <Grid gutter="xs" mt={20}>
                    <Grid.Col ta="left" span={8}>
                        <Container className={styles.container}>
                            <Markdown components={{ img: ({ node, ...props }) => <img style={{ maxWidth: '100%' }}{...props} /> }} remarkPlugins={[remarkGfm]} >{currentDao.desc}</Markdown>
                        </Container>
                    </Grid.Col>

                    <Grid.Col span={4}>
                        <Container className={styles.container}>
                            <Card padding='lg' ta="left">
                                <Center><u><h3>DAO Info</h3></u></Center>
                                <Stack gap="lg" my={20}>
                                    <Group gap="xs"><Text fw={600}>Members:</Text>{currentDao.members?.length.toString()}</Group>
                                </Stack>
                                <Center mt={20}><Button color="orange" onClick={() => join_dao(currentDao)}>JOIN</Button></Center>
                            </Card>
                        </Container>
                    </Grid.Col>
                </Grid>
            </Container>
        </>
    );
}

export default DAOPage;