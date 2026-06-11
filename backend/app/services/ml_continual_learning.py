import torch
import torch.nn as nn
from copy import deepcopy

class EWC:
    def __init__(self, model, dataloader, device, ew_weight=1.0):
        """
        Elastic Weight Consolidation (EWC) Implementation.
        Calculates Fisher Information Matrix to penalize moving weights that are important for previous tasks.
        """
        self.model = model
        self.dataloader = dataloader
        self.device = device
        self.ew_weight = ew_weight
        
        self.params = {n: p for n, p in self.model.named_parameters() if p.requires_grad}
        self._means = {}
        self._precision_matrices = self._diag_fisher()

        for n, p in deepcopy(self.params).items():
            self._means[n] = p.data

    def _diag_fisher(self):
        precision_matrices = {}
        for n, p in deepcopy(self.params).items():
            p.data.zero_()
            precision_matrices[n] = p.data

        self.model.eval()
        for input, target in self.dataloader:
            input = input.to(self.device)
            self.model.zero_grad()
            
            output = self.model(input)
            # Log likelihood estimate
            loss = nn.functional.mse_loss(output, target.to(self.device))
            loss.backward()

            for n, p in self.model.named_parameters():
                if p.grad is not None:
                    precision_matrices[n].data += p.grad.data ** 2 / len(self.dataloader)

        precision_matrices = {n: p for n, p in precision_matrices.items()}
        return precision_matrices

    def penalty(self, model):
        """
        Calculates the EWC penalty to be added to the loss during retraining.
        """
        loss = 0
        for n, p in model.named_parameters():
            if p.requires_grad and n in self._precision_matrices:
                _loss = self._precision_matrices[n] * (p - self._means[n]) ** 2
                loss += _loss.sum()
        return loss * (self.ew_weight / 2)

def attach_ewc_to_loss(loss, model, ewc_instance):
    """
    Adds EWC penalty to the base loss.
    """
    if ewc_instance is None:
        return loss
    return loss + ewc_instance.penalty(model)
